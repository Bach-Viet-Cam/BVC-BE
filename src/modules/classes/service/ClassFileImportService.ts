import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import RoadmapRepository from '../../roadmaps/repository/RoadmapRepository.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassRepository from '../repository/ClassRepository.ts';
import ImportRepository from '../repository/ImportRepository.ts';
import ClassFileImportParser from './ClassFileImportParser.ts';
import ImportFileParser from './ImportFileParser.ts';
import MemberService from './MemberService.ts';

const messages = ClassConstant.messages;
const importFile = ClassConstant.importFile;

interface FileImportAnalysis {
  parsed: Backend.ParsedClassFile;
  instrument: { id: string; name: string; isActive: boolean } | null;
  semester: Backend.Semester | null;
  isDuplicate: boolean;
  rows: Backend.ValidatedStudentRow[];
  blockingErrors: string[];
}

// Creates a class and enrolls its students from one Students_[Subject]_[Class].xlsx file (UC-09 + UC-10 combined).
export default class ClassFileImportService {
  static async preview(_lecturerId: string, file: Backend.UploadedImportFile): Promise<Backend.ClassFilePreviewDTO> {
    const analysis = await ClassFileImportService.analyze(file);
    const { parsed, instrument, semester, rows } = analysis;
    const validRows = rows.filter((row) => row.isValid).length;
    return {
      fileName: file.originalname,
      classInfo: {
        name: parsed.className,
        subjectCode: parsed.subjectCode,
        cohort: semester?.name ?? parsed.semesterName,
        instrument: instrument?.isActive ? { id: instrument.id, name: instrument.name } : null,
        startDate: semester?.startDate ?? null,
        endDate: semester?.endDate ?? null
      },
      blockingErrors: analysis.blockingErrors,
      totalRows: rows.length,
      validRows,
      errorRows: rows.length - validRows,
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        studentCode: row.studentCode,
        fullName: row.fullName,
        email: row.email,
        isValid: row.isValid,
        reason: row.reason
      }))
    };
  }

  static async confirm(lecturerId: string, file: Backend.UploadedImportFile): Promise<Backend.ClassFileImportResult> {
    const analysis = await ClassFileImportService.analyze(file);
    const [firstError] = analysis.blockingErrors;
    const { parsed } = analysis;
    if (firstError) {
      const existsMessage = analysis.semester ? messages.FILE_IMPORT_CLASS_EXISTS(parsed.className, analysis.semester.name) : null;
      throw firstError === existsMessage
        ? AppError.conflict(firstError, { code: 'MSG-08' })
        : AppError.badRequest(firstError, { code: 'MSG-08' });
    }

    const semester = analysis.semester as Backend.Semester;
    const instrument = analysis.instrument as { id: string; name: string; isActive: boolean };
    const classExistsError = (): AppError =>
      AppError.conflict(messages.FILE_IMPORT_CLASS_EXISTS(parsed.className, semester.name), { code: 'MSG-08' });
    const lockKey = `class-file-import:${semester.name.toLowerCase()}:${parsed.className.toLowerCase()}`;

    // classes has no unique index on (cohort, name), so concurrent imports of the same class are serialized by a
    // transaction-scoped advisory lock; the second one waits for the first to commit and then sees the duplicate.
    const result = await MemberService.runEnrollmentGuarded(() =>
      PrismaClientProvider.instance.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const duplicate = await ClassRepository.findClassByCohortAndName(semester.name, parsed.className, undefined, transaction);
        if (duplicate) throw classExistsError();

        const newClass = await ClassRepository.createClass(lecturerId, {
          name: parsed.className,
          cohort: semester.name,
          instrumentId: instrument.id,
          description: null,
          startDate: DateTimeUtil.toDateOnly(semester.startDate),
          endDate: DateTimeUtil.toDateOnly(semester.endDate),
          roadmapId: await RoadmapRepository.findLatestRoadmapId(instrument.id)
        }, transaction);

        const { rows, context } = await MemberService.validateAgainstDatabase(newClass.id, parsed.rows, transaction);
        const importedCount = rows.filter((row) => row.isValid).length;
        const skippedCount = rows.length - importedCount;
        if (importedCount === 0) throw AppError.badRequest(messages.FILE_IMPORT_NO_VALID_ROWS, { code: 'MSG-08' });

        const log = await ImportRepository.createConfirmedLog({
          classId: newClass.id,
          lecturerId,
          fileName: file.originalname,
          fileType: 'xlsx',
          rows
        }, transaction);
        await MemberService.enrollValidRows(newClass.id, lecturerId, rows, context, { source: 'IMPORT', instrumentId: instrument.id, importLogId: log.id }, transaction);
        await AuditLogger.record({
          actorId: lecturerId,
          action: ClassConstant.auditActions.CLASS_CREATE,
          entityType: ClassConstant.auditEntityTypes.CLASS,
          entityId: newClass.id,
          payload: { name: newClass.name, cohort: newClass.cohort, instrumentId: instrument.id, source: 'FILE_IMPORT', fileName: file.originalname }
        }, transaction);
        await AuditLogger.record({
          actorId: lecturerId,
          action: ClassConstant.auditActions.IMPORT_CONFIRM,
          entityType: ClassConstant.auditEntityTypes.IMPORT_LOG,
          entityId: log.id,
          payload: { classId: newClass.id, importedCount, skippedCount }
        }, transaction);
        return { classId: newClass.id, importedCount, skippedCount };
      }, { timeout: ClassConstant.limits.COPY_TRANSACTION_TIMEOUT_MS })
    );

    return {
      ...result,
      className: parsed.className,
      message: messages.fileImportSummary(parsed.className, result.importedCount, result.skippedCount)
    };
  }

  // Blocking errors in display order: subject, semester, existing class, no valid students.
  static collectBlockingErrors(input: {
    subjectCode: string;
    className: string;
    semesterName: string;
    instrument: { isActive: boolean } | null;
    semester: Backend.Semester | null;
    isDuplicate: boolean;
    validRows: number;
  }): string[] {
    const errors: string[] = [];
    if (!input.instrument || !input.instrument.isActive) errors.push(messages.SUBJECT_NOT_FOUND(input.subjectCode));
    if (!input.semester) errors.push(messages.FILE_IMPORT_SEMESTER_NOT_FOUND(input.semesterName));
    if (input.semester && input.isDuplicate) errors.push(messages.FILE_IMPORT_CLASS_EXISTS(input.className, input.semester.name));
    if (input.validRows === 0) errors.push(messages.FILE_IMPORT_NO_VALID_ROWS);
    return errors;
  }

  static async analyze(file: Backend.UploadedImportFile): Promise<FileImportAnalysis> {
    const extension = file.originalname.includes('.') ? (file.originalname.split('.').pop()?.toLowerCase() ?? '') : '';
    if (extension !== 'xlsx') throw AppError.badRequest(messages.FILE_IMPORT_ONLY_XLSX, { code: 'MSG-13' });
    if (file.size > importFile.MAX_BYTES) throw AppError.badRequest(messages.FILE_TOO_LARGE, { code: 'MSG-14' });

    const matrix = await ImportFileParser.readXlsxSheet(file.buffer, 'Students');
    if (!matrix) throw AppError.badRequest(messages.FILE_IMPORT_SHEET_MISSING, { code: 'MSG-08' });
    const parsed = ClassFileImportParser.parse(file.originalname, matrix);

    const instrument = await ClassRepository.findInstrumentByCode(parsed.subjectCode);
    const semester = await ClassFileImportService.findSemester(parsed.semesterName);
    const isDuplicate = semester ? Boolean(await ClassRepository.findClassByCohortAndName(semester.name, parsed.className)) : false;
    const { rows } = await MemberService.validateAgainstDatabase(null, parsed.rows, PrismaClientProvider.instance);
    const blockingErrors = ClassFileImportService.collectBlockingErrors({
      subjectCode: parsed.subjectCode,
      className: parsed.className,
      semesterName: parsed.semesterName,
      instrument,
      semester,
      isDuplicate,
      validRows: rows.filter((row) => row.isValid).length
    });
    return { parsed, instrument, semester, isDuplicate, rows, blockingErrors };
  }

  static async findSemester(name: string): Promise<Backend.Semester | null> {
    const semesters = await SystemConfigService.getSemesters();
    return semesters.find((item) => item.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
  }
}
