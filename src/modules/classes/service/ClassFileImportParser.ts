import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import StudentRowValidator from './StudentRowValidator.ts';

const messages = ClassConstant.messages;
const fileNamePattern = /^Students_([A-Za-z0-9]+)_([A-Za-z0-9]+\.[A-Za-z0-9]+\.H[12])\.xlsx$/i;
const [termColumn, subjectColumn, classColumn, studentCodeColumn, fullNameColumn, emailColumn] = [0, 1, 2, 3, 4, 5];

const fail = (message: string): never => {
  throw AppError.badRequest(message, { code: 'MSG-08' });
};

const cell = (cells: string[], index: number): string => String(cells[index] ?? '').trim();

// Pure parser for the source system's class export (Students_[Subject]_[Class].xlsx, sheet "Students").
// Columns are read by position A..F; row 1 is the header; rowNumber is the sheet line number.
export default class ClassFileImportParser {
  static parseFileName(fileName: string): { subjectCode: string; className: string } {
    const match = fileNamePattern.exec(fileName);
    if (!match) return fail(messages.FILE_IMPORT_NAME_INVALID);
    const subjectCode = match[1].toUpperCase();
    const className = match[2].toUpperCase();
    if (!className.startsWith(`${subjectCode}.`)) return fail(messages.FILE_IMPORT_CLASS_CODE_INVALID(className));
    return { subjectCode, className };
  }

  static parse(fileName: string, matrix: string[][]): Backend.ParsedClassFile {
    const { subjectCode, className } = ClassFileImportParser.parseFileName(fileName);
    const half = className.slice(-2);

    const rows: Backend.RawStudentRow[] = [];
    let termName: string | null = null;
    for (let lineIndex = 1; lineIndex < matrix.length; lineIndex += 1) {
      const cells = matrix[lineIndex] ?? [];
      const rowNumber = lineIndex + 1;
      const row = {
        rowNumber,
        studentCode: String(cells[studentCodeColumn] ?? ''),
        fullName: String(cells[fullNameColumn] ?? ''),
        email: String(cells[emailColumn] ?? '')
      };
      const term = cell(cells, termColumn);
      const isBlank = StudentRowValidator.isEmptyRow(row) && !term && !cell(cells, subjectColumn) && !cell(cells, classColumn);
      if (isBlank) continue;

      if (!term) return fail(messages.FILE_IMPORT_TERM_MISSING(rowNumber));
      if (cell(cells, subjectColumn).toUpperCase() !== subjectCode) return fail(messages.FILE_IMPORT_INCONSISTENT(rowNumber, 'Mã môn'));
      if (cell(cells, classColumn).toUpperCase() !== className) return fail(messages.FILE_IMPORT_INCONSISTENT(rowNumber, 'Mã lớp'));
      if (termName === null) termName = term;
      else if (term !== termName) return fail(messages.FILE_IMPORT_INCONSISTENT(rowNumber, 'Kì học'));

      rows.push(row);
      if (rows.length > ClassConstant.importFile.MAX_DATA_ROWS) return fail(messages.FILE_TOO_MANY_ROWS);
    }

    if (rows.length === 0 || termName === null) return fail(messages.FILE_NO_DATA);
    return { subjectCode, className, semesterName: `${termName}_${half}`, rows };
  }
}
