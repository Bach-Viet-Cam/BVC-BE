import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AssignmentProgressCalculator from './AssignmentProgressCalculator.ts';

const at = (iso: string) => new Date(iso);

describe('AssignmentProgressCalculator', () => {
  describe('isCounted', () => {
    it('trả về true cho các trạng thái PROCESSING và COMPLETED', () => {
      assert.equal(AssignmentProgressCalculator.isCounted('PROCESSING'), true);
      assert.equal(AssignmentProgressCalculator.isCounted('COMPLETED'), true);
    });

    it('trả về false cho các trạng thái không được tính lượt (REJECTED và FAILED - GBR-13)', () => {
      assert.equal(AssignmentProgressCalculator.isCounted('REJECTED'), false);
      assert.equal(AssignmentProgressCalculator.isCounted('FAILED'), false);
    });
  });

  describe('summarize (Tổng hợp tiến độ bài tập của sinh viên)', () => {
    it('chưa nộp bài nào: trả về trạng thái NOT_SUBMITTED và các trường rỗng', () => {
      const summary = AssignmentProgressCalculator.summarize([], 70);
      assert.deepEqual(summary, {
        status: 'NOT_SUBMITTED',
        submissionCount: 0,
        lastSubmittedAt: null,
        bestAccuracy: null
      });
    });

    it('chỉ có bài nộp REJECTED và FAILED: không tính vào số lượt và trạng thái vẫn là NOT_SUBMITTED', () => {
      const submissions: Backend.SubmissionSnapshot[] = [
        { status: 'REJECTED', accuracy: null, submittedAt: at('2026-10-10T01:00:00Z') },
        { status: 'FAILED', accuracy: null, submittedAt: at('2026-10-11T01:00:00Z') }
      ];
      const summary = AssignmentProgressCalculator.summarize(submissions, 70);
      assert.deepEqual(summary, {
        status: 'NOT_SUBMITTED',
        submissionCount: 0,
        lastSubmittedAt: null,
        bestAccuracy: null
      });
    });

    it('có bài đang xử lý (PROCESSING): tính là SUBMITTED mà không có bestAccuracy', () => {
      const submissions: Backend.SubmissionSnapshot[] = [
        { status: 'PROCESSING', accuracy: null, submittedAt: at('2026-10-10T01:00:00Z') }
      ];
      const summary = AssignmentProgressCalculator.summarize(submissions, 70);
      assert.equal(summary.status, 'SUBMITTED');
      assert.equal(summary.submissionCount, 1);
      assert.equal(summary.bestAccuracy, null);
      assert.deepEqual(summary.lastSubmittedAt, at('2026-10-10T01:00:00Z'));
    });

    it('đã nộp nhưng chưa đạt ngưỡng minAccuracy: trạng thái SUBMITTED', () => {
      const submissions: Backend.SubmissionSnapshot[] = [
        { status: 'COMPLETED', accuracy: 65, submittedAt: at('2026-10-10T01:00:00Z') }
      ];
      const summary = AssignmentProgressCalculator.summarize(submissions, 70);
      assert.equal(summary.status, 'SUBMITTED');
      assert.equal(summary.bestAccuracy, 65);
      assert.equal(summary.submissionCount, 1);
    });

    it('đạt hoặc vượt ngưỡng minAccuracy: trạng thái PASSED', () => {
      const submissions: Backend.SubmissionSnapshot[] = [
        { status: 'COMPLETED', accuracy: 70, submittedAt: at('2026-10-10T01:00:00Z') },
        { status: 'COMPLETED', accuracy: 85, submittedAt: at('2026-10-12T01:00:00Z') }
      ];
      const summary = AssignmentProgressCalculator.summarize(submissions, 70);
      assert.equal(summary.status, 'PASSED');
      assert.equal(summary.bestAccuracy, 85);
      assert.equal(summary.submissionCount, 2);
      assert.deepEqual(summary.lastSubmittedAt, at('2026-10-12T01:00:00Z'));
    });

    describe('Giá trị biên (Boundary cases)', () => {
      it('điểm accuracy đúng bằng minAccuracy (70.0): PASSED', () => {
        const submissions: Backend.SubmissionSnapshot[] = [
          { status: 'COMPLETED', accuracy: 70.0, submittedAt: at('2026-10-10T01:00:00Z') }
        ];
        assert.equal(AssignmentProgressCalculator.summarize(submissions, 70).status, 'PASSED');
      });

      it('điểm accuracy sát nút dưới minAccuracy (69.99): SUBMITTED', () => {
        const submissions: Backend.SubmissionSnapshot[] = [
          { status: 'COMPLETED', accuracy: 69.99, submittedAt: at('2026-10-10T01:00:00Z') }
        ];
        assert.equal(AssignmentProgressCalculator.summarize(submissions, 70).status, 'SUBMITTED');
      });

      it('điểm accuracy cực trị 0% và 100%', () => {
        const zeroSub = [{ status: 'COMPLETED' as const, accuracy: 0, submittedAt: at('2026-10-10T01:00:00Z') }];
        assert.equal(AssignmentProgressCalculator.summarize(zeroSub, 70).status, 'SUBMITTED');
        assert.equal(AssignmentProgressCalculator.summarize(zeroSub, 70).bestAccuracy, 0);

        const maxSub = [{ status: 'COMPLETED' as const, accuracy: 100, submittedAt: at('2026-10-10T01:00:00Z') }];
        assert.equal(AssignmentProgressCalculator.summarize(maxSub, 70).status, 'PASSED');
        assert.equal(AssignmentProgressCalculator.summarize(maxSub, 70).bestAccuracy, 100);
      });

      it('bài COMPLETED nhưng accuracy là null: tính vào submissionCount nhưng không tính bestAccuracy', () => {
        const submissions: Backend.SubmissionSnapshot[] = [
          { status: 'COMPLETED', accuracy: null, submittedAt: at('2026-10-10T01:00:00Z') }
        ];
        const summary = AssignmentProgressCalculator.summarize(submissions, 70);
        assert.equal(summary.status, 'SUBMITTED');
        assert.equal(summary.bestAccuracy, null);
        assert.equal(summary.submissionCount, 1);
      });

      it('bài REJECTED có accuracy 100% nhưng bị từ chối: không được lấy làm bestAccuracy', () => {
        const submissions: Backend.SubmissionSnapshot[] = [
          { status: 'COMPLETED', accuracy: 65, submittedAt: at('2026-10-10T01:00:00Z') },
          { status: 'REJECTED', accuracy: 100, submittedAt: at('2026-10-12T01:00:00Z') }
        ];
        const summary = AssignmentProgressCalculator.summarize(submissions, 70);
        assert.equal(summary.status, 'SUBMITTED');
        assert.equal(summary.bestAccuracy, 65);
        assert.equal(summary.submissionCount, 1);
        // Thời gian nộp cuối cùng là của bài hợp lệ (ngày 10 chứ không phải ngày 12)
        assert.deepEqual(summary.lastSubmittedAt, at('2026-10-10T01:00:00Z'));
      });

      it('ngưỡng minAccuracy = 0 hoặc minAccuracy = 100', () => {
        const sub = [{ status: 'COMPLETED' as const, accuracy: 0, submittedAt: at('2026-10-10T01:00:00Z') }];
        assert.equal(AssignmentProgressCalculator.summarize(sub, 0).status, 'PASSED');

        const sub99 = [{ status: 'COMPLETED' as const, accuracy: 99.9, submittedAt: at('2026-10-10T01:00:00Z') }];
        assert.equal(AssignmentProgressCalculator.summarize(sub99, 100).status, 'SUBMITTED');
      });
    });
  });
});
