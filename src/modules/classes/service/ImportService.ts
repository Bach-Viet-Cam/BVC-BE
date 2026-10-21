import ExcelJS from 'exceljs';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassDTO from '../dto/ClassDTO.ts';
import ImportRepository from '../repository/ImportRepository.ts';
import ClassAccessService from './ClassAccessService.ts';
import ImportFileParser from './ImportFileParser.ts';
import MemberService from './MemberService.ts';

const messages = ClassConstant.messages;

// UC-10 Import Student List (FR-M03.01.02): upload → preview log → confirm or cancel.
export default class ImportService {
  static async previewImport(classId: string, lecturerId: string, file: Backend.UploadedImportFile): Promise<Backend.ImportPreviewDTO> {
    await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });
    const parsedFile = await ImportFileParser.parse(file);
    const { rows } = await MemberService.validateAgainstDatabase(classId, parsedFile.rows, PrismaClientProvider.instance);
    const log = await ImportRepository.createPreviewLog({
      classId,
      lecturerId,
      fileName: file.originalname,
      fileType: parsedFile.fileType,
      rows
    });
    return ClassDTO.toImportPreviewDTO(log, rows);
  }

  static async confirmImport(classId: string, lecturerId: string, logId: string): Promise<Backend.ImportConfirmResult & { message: string }> {
    const classRecord = await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });
    const log = await ImportService.findOwnedLog(classId, lecturerId, logId);
    if (log.status !== 'PREVIEW') throw AppError.conflict(messages.IMPORT_ALREADY_PROCESSED, { code: 'MSG-08' });

    const result = await MemberService.runEnrollmentGuarded(() =>
      PrismaClientProvider.instance.$transaction(async (transaction) => {
        // Re-validate: the class or the users may have changed since the preview.
        const storedRows = ImportService.toRawRows(log.rows);
        const { rows, context } = await MemberService.validateAgainstDatabase(classId, storedRows, transaction);
        const validCount = rows.filter((row) => row.isValid).length;
        if (validCount === 0) throw AppError.conflict(messages.IMPORT_NO_VALID_ROWS, { code: 'MSG-08' });

        const isMarked = await ImportRepository.markConfirmed(logId, rows, transaction);
        if (!isMarked) throw AppError.conflict(messages.IMPORT_ALREADY_PROCESSED, { code: 'MSG-08' });
        await MemberService.enrollValidRows(classId, lecturerId, rows, context, { source: 'IMPORT', instrumentId: classRecord.instrumentId, importLogId: logId }, transaction);
        await AuditLogger.record({
          actorId: lecturerId,
          action: ClassConstant.auditActions.IMPORT_CONFIRM,
          entityType: ClassConstant.auditEntityTypes.IMPORT_LOG,
          entityId: logId,
          payload: { classId, importedCount: validCount, skippedCount: rows.length - validCount }
        }, transaction);
        return { importedCount: validCount, skippedCount: rows.length - validCount };
      })
    );
    return { ...result, message: messages.importSummary(result.importedCount, result.skippedCount) };
  }

  static async cancelImport(classId: string, lecturerId: string, logId: string): Promise<void> {
    await ClassAccessService.assertOwnedClass(classId, lecturerId);
    const log = await ImportService.findOwnedLog(classId, lecturerId, logId);
    if (log.status === 'CANCELLED') return;
    if (log.status === 'CONFIRMED') throw AppError.conflict(messages.IMPORT_ALREADY_PROCESSED, { code: 'MSG-08' });
    const isCancelled = await ImportRepository.markCancelled(logId);
    if (!isCancelled) throw AppError.conflict(messages.IMPORT_ALREADY_PROCESSED, { code: 'MSG-08' });
  }

  static async findOwnedLog(classId: string, lecturerId: string, logId: string): Promise<Backend.ImportLogRecord> {
    const log = await ImportRepository.findLogById(logId);
    if (!log || log.classId !== classId || log.lecturerId !== lecturerId) throw AppError.notFound(messages.IMPORT_LOG_NOT_FOUND);
    return log;
  }

  static toRawRows(storedRows: unknown): Backend.RawStudentRow[] {
    if (!Array.isArray(storedRows)) return [];
    return storedRows.map((storedRow: Record<string, unknown>) => ({
      rowNumber: Number(storedRow.rowNumber),
      studentCode: String(storedRow.studentCode ?? ''),
      fullName: String(storedRow.fullName ?? ''),
      email: String(storedRow.email ?? '')
    }));
  }

  static async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(ClassConstant.importFile.TEMPLATE_SHEET_NAME);
    worksheet.columns = [
      { header: ClassConstant.importFile.TEMPLATE_HEADERS[0], key: 'studentCode', width: 18, style: { numFmt: '@' } },
      { header: ClassConstant.importFile.TEMPLATE_HEADERS[1], key: 'fullName', width: 32 },
      { header: ClassConstant.importFile.TEMPLATE_HEADERS[2], key: 'email', width: 34 }
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
