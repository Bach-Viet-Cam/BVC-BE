import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassFileImportParser from './ClassFileImportParser.ts';

const messages = ClassConstant.messages;
const fileName = 'Students_DNH103_DNH103.E1.H2.xlsx';
const header = ['TermName', 'SubjectCode', 'ClassName', 'RollNumber', 'FullName', 'Email'];
const row = (overrides: Partial<Record<number, string>> = {}): string[] => {
  const base = ['Fall2026', 'DNH103', 'DNH103.E1.H2', 'HE220687', 'Phạm Chí Kiên', 'phamchikien09112008@gmail.com'];
  return base.map((value, index) => overrides[index] ?? value);
};

const throwsMessage = (fn: () => unknown, message: string): void => {
  assert.throws(fn, (error: unknown) => error instanceof AppError && error.message === message);
};

describe('ClassFileImportParser.parse', () => {
  it('parse reads the sample layout', () => {
    const parsed = ClassFileImportParser.parse(fileName, [header, row(), row({ 3: 'HE220688', 5: 'b@example.com' })]);
    assert.equal(parsed.subjectCode, 'DNH103');
    assert.equal(parsed.className, 'DNH103.E1.H2');
    assert.equal(parsed.semesterName, 'Fall2026_H2');
    assert.deepEqual(parsed.rows[0], { rowNumber: 2, studentCode: 'HE220687', fullName: 'Phạm Chí Kiên', email: 'phamchikien09112008@gmail.com' });
    assert.equal(parsed.rows[1].rowNumber, 3);
  });

  it('parse trims cells and matches codes case-insensitively', () => {
    const parsed = ClassFileImportParser.parse(fileName, [header, row({ 0: ' Fall2026 ', 1: 'dnh103', 2: 'dnh103.e1.h2' })]);
    assert.equal(parsed.semesterName, 'Fall2026_H2');
    assert.equal(parsed.className, 'DNH103.E1.H2');
  });

  it('parse skips blank trailing rows', () => {
    const parsed = ClassFileImportParser.parse(fileName, [header, row(), row({ 3: 'HE2' }), ['', '', '', '', '', '']]);
    assert.equal(parsed.rows.length, 2);
  });

  it('parse rejects a class code from another subject', () => {
    throwsMessage(
      () => ClassFileImportParser.parse('Students_DNH103_DTR103.E1.H2.xlsx', [header, row()]),
      messages.FILE_IMPORT_CLASS_CODE_INVALID('DTR103.E1.H2')
    );
  });

  it('parse rejects a row with another subject / class / term', () => {
    const second = (overrides: Partial<Record<number, string>>): string[][] => [header, row(), row(overrides)];
    throwsMessage(() => ClassFileImportParser.parse(fileName, second({ 1: 'DTR103' })), messages.FILE_IMPORT_INCONSISTENT(3, 'Mã môn'));
    throwsMessage(() => ClassFileImportParser.parse(fileName, second({ 2: 'DNH103.E1.H1' })), messages.FILE_IMPORT_INCONSISTENT(3, 'Mã lớp'));
    throwsMessage(() => ClassFileImportParser.parse(fileName, second({ 0: 'Spring2026' })), messages.FILE_IMPORT_INCONSISTENT(3, 'Kì học'));
  });

  it('parse rejects a row without term', () => {
    throwsMessage(() => ClassFileImportParser.parse(fileName, [header, row({ 0: '' })]), messages.FILE_IMPORT_TERM_MISSING(2));
  });

  it('parse rejects a file with only the header', () => {
    throwsMessage(() => ClassFileImportParser.parse(fileName, [header]), messages.FILE_NO_DATA);
  });

  it('parse rejects more than MAX_DATA_ROWS rows', () => {
    const rows = Array.from({ length: ClassConstant.importFile.MAX_DATA_ROWS + 1 }, (_, index) => row({ 3: `HE${index}` }));
    throwsMessage(() => ClassFileImportParser.parse(fileName, [header, ...rows]), messages.FILE_TOO_MANY_ROWS);
  });
});

describe('ClassFileImportParser.parseFileName', () => {
  it('parseFileName rejects a duplicated-download suffix', () => {
    throwsMessage(() => ClassFileImportParser.parseFileName('Students_DNH103_DNH103.E1.H2 (1).xlsx'), messages.FILE_IMPORT_NAME_INVALID);
  });

  it('parseFileName rejects missing parts / wrong extension', () => {
    for (const name of ['Students_DNH103.xlsx', 'DNH103_DNH103.E1.H2.xlsx', 'Students_DNH103_DNH103.E1.H2.csv']) {
      throwsMessage(() => ClassFileImportParser.parseFileName(name), messages.FILE_IMPORT_NAME_INVALID);
    }
  });

  it('parseFileName rejects a class code without H1/H2', () => {
    throwsMessage(() => ClassFileImportParser.parseFileName('Students_DNH103_DNH103.E1.X2.xlsx'), messages.FILE_IMPORT_NAME_INVALID);
  });
});
