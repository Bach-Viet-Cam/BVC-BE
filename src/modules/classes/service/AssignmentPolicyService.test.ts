import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AssignmentPolicyService from './AssignmentPolicyService.ts';

const now = new Date('2026-10-15T10:00:00.000Z');
const future = new Date('2026-10-20T10:00:00.000Z');
const past = new Date('2026-10-01T10:00:00.000Z');

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

  describe('Giá trị biên (Boundary cases)', () => {
    it('điểm accuracy đúng bằng minAccuracy (70.0): PASSED', () => {
      const submissions = [{ status: 'COMPLETED' as const, accuracy: 70.0 }];
      assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: past, now, minAccuracy: 70, submissions }), 'PASSED');
    });

    it('điểm accuracy sát nút dưới minAccuracy (69.99): SUBMITTED', () => {
      const submissions = [{ status: 'COMPLETED' as const, accuracy: 69.99 }];
      assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: future, now, minAccuracy: 70, submissions }), 'SUBMITTED');
    });

    it('thời điểm deadline đúng bằng now (từng mili-giây): NOT_SUBMITTED (chưa tính là quá hạn)', () => {
      assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: now, now, minAccuracy: 70, submissions: [] }), 'NOT_SUBMITTED');
    });

    it('thời điểm deadline trước now đúng 1 mili-giây: OVERDUE', () => {
      const oneMsPast = new Date(now.getTime() - 1);
      assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: oneMsPast, now, minAccuracy: 70, submissions: [] }), 'OVERDUE');
    });

    it('bài nộp COMPLETED nhưng accuracy là null: SUBMITTED (chưa đạt PASSED)', () => {
      const submissions = [{ status: 'COMPLETED' as const, accuracy: null }];
      assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: future, now, minAccuracy: 70, submissions }), 'SUBMITTED');
    });

    it('hỗn hợp: nhiều bài REJECTED, FAILED và 1 bài COMPLETED đạt điểm: PASSED', () => {
      const submissions = [
        { status: 'REJECTED' as const, accuracy: null },
        { status: 'FAILED' as const, accuracy: null },
        { status: 'COMPLETED' as const, accuracy: 50 },
        { status: 'COMPLETED' as const, accuracy: 90 }
      ];
      assert.equal(AssignmentPolicyService.getStudentStatus({ deadline: past, now, minAccuracy: 70, submissions }), 'PASSED');
    });
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

  it('bài tập không giới hạn (maxSubmissions = null) vẫn được nộp sau nhiều lượt', () => {
    assert.equal(
      AssignmentPolicyService.canSubmit({
        isPublished: true,
        deadline: new Date('2099-01-01'),
        now: new Date(),
        maxSubmissions: null,
        submissions: Array.from({ length: 10 }, () => ({ status: 'COMPLETED' as const }))
      }),
      true
    );
  });

  describe('Giá trị biên (Boundary cases)', () => {
    it('đúng mốc deadline = now (từng ms): vẫn cho phép nộp', () => {
      assert.equal(AssignmentPolicyService.canSubmit({ ...base, deadline: now, now }), true);
    });

    it('quá hạn đúng 1 ms (deadline = now - 1ms): bị chặn', () => {
      const oneMsPast = new Date(now.getTime() - 1);
      assert.equal(AssignmentPolicyService.canSubmit({ ...base, deadline: oneMsPast, now }), false);
    });

    it('còn đúng 1 lượt nộp cuối cùng (usedSubmissions = maxSubmissions - 1): cho phép nộp', () => {
      const submissions = [{ status: 'COMPLETED' as const }, { status: 'COMPLETED' as const }];
      assert.equal(AssignmentPolicyService.canSubmit({ ...base, maxSubmissions: 3, submissions }), true);
    });

    it('vừa chạm ngưỡng maxSubmissions (usedSubmissions = maxSubmissions): chặn nộp', () => {
      const submissions = [{ status: 'COMPLETED' as const }, { status: 'COMPLETED' as const }, { status: 'COMPLETED' as const }];
      assert.equal(AssignmentPolicyService.canSubmit({ ...base, maxSubmissions: 3, submissions }), false);
    });

    it('khi maxSubmissions = 1: cho nộp lần đầu và chặn ngay ở lần thứ hai', () => {
      assert.equal(AssignmentPolicyService.canSubmit({ ...base, maxSubmissions: 1, submissions: [] }), true);
      assert.equal(AssignmentPolicyService.canSubmit({ ...base, maxSubmissions: 1, submissions: [{ status: 'PROCESSING' as const }] }), false);
    });
  });
});

describe('AssignmentPolicyService.countUsedSubmissions', () => {
  it('chỉ đếm bài nộp không bị từ chối hoặc lỗi', () => {
    const submissions = [
      { status: 'COMPLETED' as const },
      { status: 'REJECTED' as const },
      { status: 'FAILED' as const },
      { status: 'PROCESSING' as const }
    ];
    assert.equal(AssignmentPolicyService.countUsedSubmissions(submissions), 2);
  });

  it('danh sách rỗng: trả về 0', () => {
    assert.equal(AssignmentPolicyService.countUsedSubmissions([]), 0);
  });

  it('toàn bộ bị từ chối hoặc lỗi: trả về 0 lượt sử dụng', () => {
    const submissions = [{ status: 'REJECTED' as const }, { status: 'FAILED' as const }];
    assert.equal(AssignmentPolicyService.countUsedSubmissions(submissions), 0);
  });
});
