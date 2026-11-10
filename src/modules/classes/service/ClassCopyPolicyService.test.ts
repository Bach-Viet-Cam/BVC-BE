import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ClassCopyPolicyService from './ClassCopyPolicyService.ts';

function item(kind: Backend.AssignmentKind, sheetMusicId: string | null = null, title = 'Bài'): Backend.CopyAssignmentInput {
  return { title, kind, sheetMusicId, status: 'DRAFT' } as unknown as Backend.CopyAssignmentInput;
}

describe('ClassCopyPolicyService.findAssignmentErrors', () => {
  it('danh sách rỗng không có lỗi', () => {
    assert.deepEqual(ClassCopyPolicyService.findAssignmentErrors([], new Set()), []);
  });

  it('cho phép nhiều bài OTHER và BONUS', () => {
    const list = [item('SOLO'), item('ENSEMBLE'), item('OTHER'), item('OTHER'), item('BONUS'), item('BONUS')];
    assert.deepEqual(ClassCopyPolicyService.findAssignmentErrors(list, new Set()), []);
  });

  it('báo lỗi mọi bài SOLO trùng', () => {
    const errors = ClassCopyPolicyService.findAssignmentErrors([item('SOLO', null, 'A'), item('OTHER', null, 'B'), item('SOLO', null, 'C')], new Set());
    assert.equal(errors.length, 2);
    assert.deepEqual(errors.map((e) => e.field), ['assignments.0.kind', 'assignments.2.kind']);
    assert.equal(errors[0].code, 'MSG-08');
    assert.equal(errors[0].message, 'Không thể lưu bài tập vì danh sách sao chép có nhiều hơn một bài Độc tấu.');
  });

  it('báo lỗi ENSEMBLE trùng', () => {
    const errors = ClassCopyPolicyService.findAssignmentErrors([item('ENSEMBLE'), item('ENSEMBLE')], new Set());
    assert.equal(errors.length, 2);
    assert.ok(errors[0].message.includes('Hòa tấu'));
  });

  it('báo lỗi bản nhạc không dùng được', () => {
    const errors = ClassCopyPolicyService.findAssignmentErrors([item('OTHER', 's1'), item('OTHER', 's2')], new Set(['s1']));
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'assignments.1.sheetMusicId');
    assert.equal(errors[0].code, 'MSG-48');
  });

  it('bài không có bản nhạc không bị lỗi bản nhạc', () => {
    assert.deepEqual(ClassCopyPolicyService.findAssignmentErrors([item('OTHER', null)], new Set()), []);
  });
});
