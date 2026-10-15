import ClassConstant from '../constant/ClassConstant.ts';

const reasons = ClassConstant.rowReasons;
const labels = ClassConstant.fieldLabels;
const limits = ClassConstant.limits;

const fieldMaxLengths: Readonly<Record<Backend.StudentRowField, number>> = {
  studentCode: limits.STUDENT_CODE_MAX,
  fullName: limits.FULL_NAME_MAX,
  email: limits.EMAIL_MAX
};

const rowFields: readonly Backend.StudentRowField[] = ['studentCode', 'fullName', 'email'];

// Pure validation shared by the import preview, import confirm and "add one student" (UC-10).
// It never touches the database: the caller supplies existing users and active members.
export default class StudentRowValidator {
  static normalizeRow(row: Backend.RawStudentRow): Backend.RawStudentRow {
    return {
      rowNumber: row.rowNumber,
      studentCode: (row.studentCode ?? '').trim().toUpperCase(),
      fullName: (row.fullName ?? '').trim().replace(/\s+/g, ' '),
      email: (row.email ?? '').trim().toLowerCase()
    };
  }

  static isEmptyRow(row: Backend.StudentRowInput): boolean {
    return rowFields.every((field) => !(row[field] ?? '').trim());
  }

  static validateRows(rows: Backend.RawStudentRow[], context: Backend.StudentValidationContext): Backend.ValidatedStudentRow[] {
    const firstRowByEmail = new Map<string, number>();
    const firstRowByCode = new Map<string, number>();

    return rows.map((rawRow) => {
      const row = StudentRowValidator.normalizeRow(rawRow);
      const fieldIssue = StudentRowValidator.findFieldIssue(row);
      const duplicateIssue = fieldIssue ?? StudentRowValidator.findDuplicateIssue(row, firstRowByEmail, firstRowByCode);
      StudentRowValidator.rememberRow(row, firstRowByEmail, firstRowByCode);
      const issue = duplicateIssue ?? StudentRowValidator.findExistingDataIssue(row, context);
      const existingUser = context.usersByEmail.get(row.email);
      return {
        ...row,
        isValid: issue === null,
        reason: issue?.reason ?? null,
        reasonField: issue?.field ?? null,
        existingUserId: existingUser?.id ?? null
      };
    });
  }

  static findFieldIssue(row: Backend.RawStudentRow): { field: Backend.StudentRowField; reason: string } | null {
    for (const field of rowFields) {
      if (!row[field]) return { field, reason: reasons.missing(labels[field]) };
    }
    for (const field of rowFields) {
      if (row[field].length > fieldMaxLengths[field]) {
        return { field, reason: reasons.tooLong(labels[field], fieldMaxLengths[field]) };
      }
    }
    if (!ClassConstant.emailPattern.test(row.email)) return { field: 'email', reason: reasons.INVALID_EMAIL };
    return null;
  }

  static findDuplicateIssue(
    row: Backend.RawStudentRow,
    firstRowByEmail: Map<string, number>,
    firstRowByCode: Map<string, number>
  ): { field: Backend.StudentRowField; reason: string } | null {
    const duplicateEmailRow = firstRowByEmail.get(row.email);
    if (duplicateEmailRow !== undefined) return { field: 'email', reason: reasons.duplicateInFile(duplicateEmailRow) };
    const duplicateCodeRow = firstRowByCode.get(row.studentCode);
    if (duplicateCodeRow !== undefined) return { field: 'studentCode', reason: reasons.duplicateInFile(duplicateCodeRow) };
    return null;
  }

  static rememberRow(row: Backend.RawStudentRow, firstRowByEmail: Map<string, number>, firstRowByCode: Map<string, number>): void {
    if (row.email && !firstRowByEmail.has(row.email)) firstRowByEmail.set(row.email, row.rowNumber);
    if (row.studentCode && !firstRowByCode.has(row.studentCode)) firstRowByCode.set(row.studentCode, row.rowNumber);
  }

  static findExistingDataIssue(
    row: Backend.RawStudentRow,
    context: Backend.StudentValidationContext
  ): { field: Backend.StudentRowField; reason: string } | null {
    const userByEmail = context.usersByEmail.get(row.email);
    const userByCode = context.usersByStudentCode.get(row.studentCode);

    if (userByEmail && context.activeMemberIds.has(userByEmail.id)) return { field: 'email', reason: reasons.ALREADY_IN_CLASS };
    if (userByCode && userByCode.email !== row.email) return { field: 'studentCode', reason: reasons.CODE_BELONGS_TO_OTHER_EMAIL };
    if (userByEmail && userByEmail.studentCode && userByEmail.studentCode !== row.studentCode) {
      return { field: 'email', reason: reasons.EMAIL_HAS_OTHER_CODE };
    }
    if (userByEmail && userByEmail.role !== context.studentRole) return { field: 'email', reason: reasons.EMAIL_NOT_STUDENT };
    return null;
  }
}
