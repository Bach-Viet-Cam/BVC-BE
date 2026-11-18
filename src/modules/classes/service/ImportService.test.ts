import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ClassConstant from '../constant/ClassConstant.ts';
import ImportService from './ImportService.ts';

const messages = ClassConstant.messages;
const reasons = ClassConstant.rowReasons;

const row = (reason: string | null): Backend.ValidatedStudentRow =>
  ({ rowNumber: 2, studentCode: 'SE1', fullName: 'A', email: 'a@fpt.edu.vn', isValid: reason === null, reason }) as Backend.ValidatedStudentRow;

describe('ImportService.assertFileMatchesClass', () => {
  it('accepts the same class code ignoring case and surrounding spaces', () => {
    assert.doesNotThrow(() => ImportService.assertFileMatchesClass('DNH103.E1.H2', ' dnh103.e1.h2 '));
  });

  it('rejects a file made for another class with the mismatch warning', () => {
    assert.throws(() => ImportService.assertFileMatchesClass('DNH103.E2.H2', 'DNH103.E1.H2'), {
      message: messages.IMPORT_CLASS_MISMATCH('DNH103.E2.H2', 'DNH103.E1.H2')
    });
  });
});

describe('ImportService.isEveryRowAlreadyInClass', () => {
  it('is true when every row is already a member', () => {
    assert.equal(ImportService.isEveryRowAlreadyInClass([row(reasons.ALREADY_IN_CLASS), row(reasons.ALREADY_IN_CLASS)]), true);
  });

  it('is false when at least one row is new', () => {
    assert.equal(ImportService.isEveryRowAlreadyInClass([row(reasons.ALREADY_IN_CLASS), row(null)]), false);
  });

  it('is false when the other rows fail for a different reason', () => {
    assert.equal(ImportService.isEveryRowAlreadyInClass([row(reasons.ALREADY_IN_CLASS), row(reasons.INVALID_EMAIL)]), false);
  });

  it('is false for an empty list', () => {
    assert.equal(ImportService.isEveryRowAlreadyInClass([]), false);
  });
});
