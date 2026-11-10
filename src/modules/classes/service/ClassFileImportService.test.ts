import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassFileImportService from './ClassFileImportService.ts';

const messages = ClassConstant.messages;
const base = {
  subjectCode: 'DNH103',
  className: 'DNH103.E1.H2',
  semesterName: 'Fall2026_H2',
  instrument: { isActive: true } as { isActive: boolean } | null,
  semester: { name: 'Fall2026_H2', startDate: '2026-11-09', endDate: '2026-12-27' } as Backend.Semester | null,
  isDuplicate: false,
  validRows: 13
};

describe('ClassFileImportService.collectBlockingErrors', () => {
  it('returns no errors for a clean file', () => {
    assert.deepEqual(ClassFileImportService.collectBlockingErrors(base), []);
  });

  it('reports a missing subject', () => {
    assert.deepEqual(ClassFileImportService.collectBlockingErrors({ ...base, instrument: null }), [messages.SUBJECT_NOT_FOUND('DNH103')]);
  });

  it('treats an inactive instrument as missing', () => {
    assert.deepEqual(ClassFileImportService.collectBlockingErrors({ ...base, instrument: { isActive: false } }), [messages.SUBJECT_NOT_FOUND('DNH103')]);
  });

  it('reports a missing semester', () => {
    assert.deepEqual(ClassFileImportService.collectBlockingErrors({ ...base, semester: null }), [messages.FILE_IMPORT_SEMESTER_NOT_FOUND('Fall2026_H2')]);
  });

  it('reports an existing class', () => {
    assert.deepEqual(ClassFileImportService.collectBlockingErrors({ ...base, isDuplicate: true }), [messages.FILE_IMPORT_CLASS_EXISTS('DNH103.E1.H2', 'Fall2026_H2')]);
  });

  it('reports no valid rows', () => {
    assert.deepEqual(ClassFileImportService.collectBlockingErrors({ ...base, validRows: 0 }), [messages.FILE_IMPORT_NO_VALID_ROWS]);
  });

  it('lists every error in order', () => {
    assert.deepEqual(ClassFileImportService.collectBlockingErrors({ ...base, instrument: null, semester: null, validRows: 0 }), [
      messages.SUBJECT_NOT_FOUND('DNH103'),
      messages.FILE_IMPORT_SEMESTER_NOT_FOUND('Fall2026_H2'),
      messages.FILE_IMPORT_NO_VALID_ROWS
    ]);
  });
});

describe('ClassFileImportService.analyze file type', () => {
  for (const originalname of ['a.xls', 'a.csv', 'a.pdf', 'noextension']) {
    it(`rejects ${originalname} with the only-xlsx message`, async () => {
      const file = { originalname, size: 1, buffer: Buffer.from('x') } as Backend.UploadedImportFile;
      await assert.rejects(() => ClassFileImportService.analyze(file), { message: messages.FILE_IMPORT_ONLY_XLSX });
    });
  }
});
