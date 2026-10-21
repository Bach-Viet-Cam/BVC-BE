import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import ClassModel from '../model/ClassModel.ts';

export default class ImportRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async createPreviewLog(data: {
    classId: string;
    lecturerId: string;
    fileName: string;
    fileType: Backend.ImportFileType;
    rows: Backend.ValidatedStudentRow[];
  }): Promise<Backend.ImportLogRecord> {
    const validRows = data.rows.filter((row) => row.isValid).length;
    const log = await ImportRepository.client.studentImportLog.create({
      data: {
        classId: data.classId,
        lecturerId: data.lecturerId,
        fileName: data.fileName,
        fileType: data.fileType,
        totalRows: data.rows.length,
        validRows,
        errorRows: data.rows.length - validRows,
        rows: data.rows as unknown as Prisma.InputJsonValue,
        status: 'PREVIEW'
      },
      select: ClassModel.importLogSelect
    });
    return log as Backend.ImportLogRecord;
  }

  static async findLogById(logId: string, client: Prisma.TransactionClient = ImportRepository.client): Promise<Backend.ImportLogRecord | null> {
    const log = await client.studentImportLog.findUnique({ where: { id: logId }, select: ClassModel.importLogSelect });
    return log as Backend.ImportLogRecord | null;
  }

  // Guarded on status so a confirm/cancel race cannot both win.
  static async markConfirmed(logId: string, rows: Backend.ValidatedStudentRow[], client: Prisma.TransactionClient): Promise<boolean> {
    const validRows = rows.filter((row) => row.isValid).length;
    const result = await client.studentImportLog.updateMany({
      where: { id: logId, status: 'PREVIEW' },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        validRows,
        errorRows: rows.length - validRows,
        rows: rows as unknown as Prisma.InputJsonValue
      }
    });
    return result.count === 1;
  }

  static async markCancelled(logId: string): Promise<boolean> {
    const result = await ImportRepository.client.studentImportLog.updateMany({
      where: { id: logId, status: 'PREVIEW' },
      data: { status: 'CANCELLED' }
    });
    return result.count === 1;
  }
}
