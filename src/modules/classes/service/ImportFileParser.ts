import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import StudentRowValidator from './StudentRowValidator.ts';

const importFile = ClassConstant.importFile;
const messages = ClassConstant.messages;
const requiredFields: readonly Backend.StudentRowField[] = ['studentCode', 'fullName', 'email'];

// Reads an uploaded .xlsx/.csv student list (UC-10 step 2). Row 1 is the header;
// rowNumber is the spreadsheet line number so error messages match what the lecturer sees.
export default class ImportFileParser {
  static async parse(file: Backend.UploadedImportFile): Promise<Backend.ParsedImportFile> {
    const fileType = ImportFileParser.detectFileType(file.originalname);
    if (file.size > importFile.MAX_BYTES) throw AppError.badRequest(messages.FILE_TOO_LARGE, { code: 'MSG-14' });

    const matrix = fileType === 'xlsx'
      ? await ImportFileParser.readXlsx(file.buffer)
      : ImportFileParser.readCsv(file.buffer);
    return { fileType, rows: ImportFileParser.toStudentRows(matrix) };
  }

  static detectFileType(fileName: string): Backend.ImportFileType {
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!(importFile.ALLOWED_EXTENSIONS as readonly string[]).includes(extension) || !fileName.includes('.')) {
      throw AppError.badRequest(messages.UNSUPPORTED_FILE, { code: 'MSG-13' });
    }
    return extension as Backend.ImportFileType;
  }

  static async readXlsx(buffer: Buffer): Promise<string[][]> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw AppError.badRequest(messages.FILE_UNREADABLE, { code: 'MSG-08' });
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const matrix: string[][] = [];
    for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const row = worksheet.getRow(rowIndex);
      const cells: string[] = [];
      for (let columnIndex = 1; columnIndex <= Math.max(row.cellCount, 0); columnIndex += 1) {
        cells.push(row.getCell(columnIndex).text ?? '');
      }
      matrix.push(cells);
    }
    return matrix;
  }

  static readCsv(buffer: Buffer): string[][] {
    const content = buffer.toString('utf8');
    const firstLine = content.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    try {
      return parseCsv(content, { bom: true, delimiter, relax_column_count: true, skip_empty_lines: false });
    } catch {
      throw AppError.badRequest(messages.FILE_UNREADABLE, { code: 'MSG-08' });
    }
  }

  static normalizeHeader(header: string): string {
    return header
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  static mapColumns(headerRow: string[]): Record<Backend.StudentRowField, number> {
    const columnIndexes: Partial<Record<Backend.StudentRowField, number>> = {};
    headerRow.forEach((header, columnIndex) => {
      const normalizedHeader = ImportFileParser.normalizeHeader(header ?? '');
      const field = requiredFields.find((candidate) => ClassConstant.importHeaderAliases[candidate].includes(normalizedHeader));
      if (field && columnIndexes[field] === undefined) columnIndexes[field] = columnIndex;
    });

    const missingFields = requiredFields.filter((field) => columnIndexes[field] === undefined);
    if (missingFields.length > 0) {
      const missingLabels = missingFields.map((field) => ClassConstant.fieldLabels[field]).join(', ');
      throw AppError.badRequest(messages.FILE_MISSING_COLUMNS(missingLabels), { code: 'MSG-08' });
    }
    return columnIndexes as Record<Backend.StudentRowField, number>;
  }

  static toStudentRows(matrix: string[][]): Backend.RawStudentRow[] {
    if (matrix.length === 0) throw AppError.badRequest(messages.FILE_MISSING_COLUMNS('Mã sinh viên, Họ tên, Email'), { code: 'MSG-08' });
    const columns = ImportFileParser.mapColumns(matrix[0]);

    const rows: Backend.RawStudentRow[] = [];
    for (let lineIndex = 1; lineIndex < matrix.length; lineIndex += 1) {
      const cells = matrix[lineIndex] ?? [];
      const row = {
        rowNumber: lineIndex + 1,
        studentCode: String(cells[columns.studentCode] ?? ''),
        fullName: String(cells[columns.fullName] ?? ''),
        email: String(cells[columns.email] ?? '')
      };
      if (StudentRowValidator.isEmptyRow(row)) continue;
      rows.push(row);
      if (rows.length > importFile.MAX_DATA_ROWS) throw AppError.badRequest(messages.FILE_TOO_MANY_ROWS, { code: 'MSG-08' });
    }

    if (rows.length === 0) throw AppError.badRequest(messages.FILE_NO_DATA, { code: 'MSG-08' });
    return rows;
  }
}
