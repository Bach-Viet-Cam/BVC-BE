import { describe, expect, it } from 'vitest';
import StudentRowValidator from '../../src/modules/classes/service/StudentRowValidator.ts';

const STUDENT = 1;
const TEACHER = 2;

function buildContext(
  users: Backend.ExistingUserSnapshot[] = [],
  activeMemberIds: string[] = []
): Backend.StudentValidationContext {
  return {
    usersByEmail: new Map(users.map((user) => [user.email, user])),
    usersByStudentCode: new Map(users.filter((user) => user.studentCode).map((user) => [user.studentCode as string, user])),
    activeMemberIds: new Set(activeMemberIds),
    studentRole: STUDENT
  };
}

function row(rowNumber: number, studentCode: string, fullName: string, email: string): Backend.RawStudentRow {
  return { rowNumber, studentCode, fullName, email };
}

describe('StudentRowValidator', () => {
  it('normalizes whitespace, email case and student code case', () => {
    expect(StudentRowValidator.normalizeRow(row(2, ' se171234 ', '  Trần   Minh Anh ', ' AnhTM@FPT.edu.vn '))).toEqual(
      row(2, 'SE171234', 'Trần Minh Anh', 'anhtm@fpt.edu.vn')
    );
  });

  it('accepts a valid new student with a Vietnamese UTF-8 name', () => {
    const [result] = StudentRowValidator.validateRows([row(2, 'SE171234', 'Ngô Thảo My', 'mynt@fpt.edu.vn')], buildContext());
    expect(result).toMatchObject({ isValid: true, reason: null, existingUserId: null, fullName: 'Ngô Thảo My' });
  });

  it('reports which required field is missing', () => {
    const results = StudentRowValidator.validateRows([
      row(2, '', 'A', 'a@fpt.edu.vn'),
      row(3, 'SE1', '', 'b@fpt.edu.vn'),
      row(4, 'SE2', 'C', '')
    ], buildContext());
    expect(results.map((result) => [result.reason, result.reasonField])).toEqual([
      ['Thiếu mã sinh viên', 'studentCode'],
      ['Thiếu họ tên', 'fullName'],
      ['Thiếu email', 'email']
    ]);
  });

  it('rejects an invalid email and overly long fields', () => {
    const results = StudentRowValidator.validateRows([
      row(2, 'SE1', 'A', 'not-an-email'),
      row(3, 'SE2', 'x'.repeat(101), 'b@fpt.edu.vn')
    ], buildContext());
    expect(results[0].reason).toBe('Email không hợp lệ');
    expect(results[1].reason).toBe('Họ tên quá dài (tối đa 100 ký tự)');
  });

  it('flags duplicates inside the file by email (case-insensitive) or student code', () => {
    const results = StudentRowValidator.validateRows([
      row(2, 'SE1', 'A', 'a@fpt.edu.vn'),
      row(12, 'SE9', 'A again', 'A@FPT.edu.vn'),
      row(13, 'se1', 'Other', 'other@fpt.edu.vn')
    ], buildContext());
    expect(results.map((result) => result.reason)).toEqual([null, 'Trùng dòng 2 trong file', 'Trùng dòng 2 trong file']);
  });

  it('flags a student who is already an active member', () => {
    const context = buildContext([{ id: 'u1', email: 'baolq@fpt.edu.vn', studentCode: 'SE170087', role: STUDENT }], ['u1']);
    const [result] = StudentRowValidator.validateRows([row(19, 'SE170087', 'Lê Quốc Bảo', 'baolq@fpt.edu.vn')], context);
    expect(result).toMatchObject({ isValid: false, reason: 'Đã có trong lớp', existingUserId: 'u1' });
  });

  it('flags conflicts with existing users (DBR-01)', () => {
    const context = buildContext([
      { id: 'u1', email: 'owner@fpt.edu.vn', studentCode: 'SE1', role: STUDENT },
      { id: 'u2', email: 'coded@fpt.edu.vn', studentCode: 'SE2', role: STUDENT },
      { id: 'u3', email: 'teacher@fpt.edu.vn', studentCode: null, role: TEACHER }
    ]);
    const results = StudentRowValidator.validateRows([
      row(2, 'SE1', 'A', 'someone-else@fpt.edu.vn'),
      row(3, 'SE3', 'B', 'coded@fpt.edu.vn'),
      row(4, 'SE4', 'C', 'teacher@fpt.edu.vn')
    ], context);
    expect(results.map((result) => result.reason)).toEqual([
      'Mã sinh viên đã thuộc tài khoản có email khác',
      'Email đã gắn với mã sinh viên khác',
      'Email thuộc tài khoản không phải sinh viên'
    ]);
  });

  it('accepts an existing student without a code and links the existing account', () => {
    const context = buildContext([{ id: 'u5', email: 'nocode@fpt.edu.vn', studentCode: null, role: STUDENT }]);
    const [result] = StudentRowValidator.validateRows([row(2, 'SE5', 'E', 'nocode@fpt.edu.vn')], context);
    expect(result).toMatchObject({ isValid: true, existingUserId: 'u5' });
  });

  it('recognizes fully empty rows', () => {
    expect(StudentRowValidator.isEmptyRow({ studentCode: ' ', fullName: '', email: '' })).toBe(true);
    expect(StudentRowValidator.isEmptyRow({ studentCode: '', fullName: 'A', email: '' })).toBe(false);
  });
});
