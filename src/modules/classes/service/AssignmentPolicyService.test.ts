import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AssignmentPolicyService from './AssignmentPolicyService.ts';

const now = new Date('2026-10-15T10:00:00Z');
const future = new Date('2026-10-20T10:00:00Z');
const past = new Date('2026-10-01T10:00:00Z');

describe('AssignmentPolicyService.getStudentStatus (GBR-26)', () => {
  it('OVERDUE khi quá hạn mà chưa có bài nộp hợp lệ', () => {
    assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: past, now, minAccuracy: 70, submissions: [] }), 'OVERDUE');
  });
  it('NOT_SUBMITTED khi còn hạn và chưa nộp', () => {
    assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: future, now, minAccuracy: 70, submissions: [] }), 'NOT_SUBMITTED');
  });
  it('PASSED khi có bài đạt accuracy tối thiểu', () => {
    const submissions = [{ status: 'COMPLETED' as const, accuracy: 72 }, { status: 'COMPLETED' as const, accuracy: 60 }];
    assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: past, now, minAccuracy: 70, submissions }), 'PASSED');
  });
  it('SUBMITTED khi đã nộp nhưng chưa đạt', () => {
    const submissions = [{ status: 'COMPLETED' as const, accuracy: 60 }];
    assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: future, now, minAccuracy: 70, submissions }), 'SUBMITTED');
  });
  it('bài đang xử lý được tính là đã nộp', () => {
    const submissions = [{ status: 'PROCESSING' as const, accuracy: null }];
    assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: past, now, minAccuracy: 70, submissions }), 'SUBMITTED');
  });
  it('bài bị từ chối hoặc lỗi không được tính là đã nộp', () => {
    const submissions = [{ status: 'REJECTED' as const, accuracy: null }, { status: 'FAILED' as const, accuracy: null }];
    assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: future, now, minAccuracy: 70, submissions }), 'NOT_SUBMITTED');
  });
});

describe('AssignmentPolicyService.canSubmit (GBR-25, GBR-13, GBR-61)', () => {
  const base = { isPublished: true, deadline: future, now, maxSubmissions: 3, submissions: [] as { status: 'COMPLETED' | 'REJECTED' | 'FAILED' | 'PROCESSING' }[] };
  it('cho nộp khi còn hạn, đã giao và còn lượt', () => {
    assert.equal(AssignmentPolicyService.canSubmit(base), true);
  });
  it('chặn khi quá hạn', () => {
    assert.equal(AssignmentPolicyService.canSubmit({ ...base, deadline: past }), false);
  });
  it('chặn khi hết lượt nộp', () => {
    const submissions = [{ status: 'COMPLETED' as const }, { status: 'COMPLETED' as const }, { status: 'PROCESSING' as const }];
    assert.equal(AssignmentPolicyService.canSubmit({ ...base, submissions }), false);
  });
  it('bài bị từ chối hoặc lỗi xử lý không trừ lượt', () => {
    const submissions = [{ status: 'REJECTED' as const }, { status: 'REJECTED' as const }, { status: 'FAILED' as const }];
    assert.equal(AssignmentPolicyService.canSubmit({ ...base, submissions }), true);
  });
  it('chặn khi bài chưa được giao', () => {
    assert.equal(AssignmentPolicyService.canSubmit({ ...base, isPublished: false }), false);
  });
});

describe('AssignmentPolicyService.countUsedSubmissions', () => {
  it('chỉ đếm bài nộp không bị từ chối hoặc lỗi', () => {
    const submissions = [{ status: 'COMPLETED' as const }, { status: 'REJECTED' as const }, { status: 'FAILED' as const }, { status: 'PROCESSING' as const }];
    assert.equal(AssignmentPolicyService.countUsedSubmissions(submissions), 2);
  });
});
