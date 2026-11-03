import { test } from 'node:test';
import assert from 'node:assert/strict';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSegmentDTO from './PracticeSegmentDTO.ts';

const at = new Date('2026-11-03T10:00:00Z');
const record: Practice.SegmentRecord = {
  id: 'seg-2', submissionId: 'sub-1', studentId: 'student', startSec: 12.004, endSec: 20, studentUploadId: null, fileUrl: null,
  status: 'COMPLETED', stage: 'FEEDBACK', stageStartedAt: at, evaluationId: 'ev-2', messageId: 'm-2', publicationState: 'published', attempt: 1,
  result: { overallScore: 81, pitchAccuracyPercent: 85, rhythmAccuracyPercent: 75, aiFeedback: 'Giữ nhịp tốt.',
    pitchErrorSegments: [{ startTime: 14.2, endTime: 15.1, averageCentsDifference: -120.4 }],
    rhythmSegments: [{ startTime: 16, endTime: 18, status: 'slow' }] },
  aiFeedback: 'Giữ nhịp tốt.', accuracy: 81, pitchAccuracy: 85, rhythmAccuracy: 75, baselineAccuracy: 62, baselinePitch: 60, baselineRhythm: 65,
  rejectReason: null, errorCode: null, errorMessage: null, analyzedAt: at, createdAt: at, updatedAt: at
};
const previous: Practice.SegmentRecord = { ...record, id: 'seg-1', accuracy: 70, pitchAccuracy: 72, rhythmAccuracy: 68, createdAt: new Date('2026-11-03T09:00:00Z') };
const dto = new PracticeSegmentDTO();

test('comparison.original lấy từ baseline*, null khi baselineAccuracy null', () => {
  assert.deepEqual(dto.toAttempt(record, null).comparison.original, { overall: 62, pitch: 60, rhythm: 65 });
  assert.equal(dto.toAttempt({ ...record, baselineAccuracy: null, baselinePitch: null, baselineRhythm: null }, null).comparison.original, null);
});

test('comparison.previous mang điểm và id của lần trước', () => {
  assert.deepEqual(dto.toAttempt(record, previous).comparison.previous, { overall: 70, pitch: 72, rhythm: 68, attemptId: 'seg-1' });
  assert.equal(dto.toAttempt(record, null).comparison.previous, null);
});

test('issues dùng mốc thời gian gốc từ result', () => {
  const issues = dto.toAttempt(record, null).issues;
  assert.deepEqual(issues.map((issue) => [issue.kind, issue.startSec, issue.endSec]), [['pitch', 14.2, 15.1], ['rhythm', 16, 18]]);
});

test('điểm null của đoạn không có nốt vẫn trả scores với trường null', () => {
  const silent = { ...record, accuracy: null, pitchAccuracy: null, rhythmAccuracy: null, baselineAccuracy: null, result: { aiFeedback: 'x' } };
  const attempt = dto.toAttempt(silent, null);
  assert.deepEqual(attempt.scores, { overall: null, pitch: null, rhythm: null });
  assert.deepEqual(attempt.issues, []);
});

test('đang xử lý chưa có scores, issues và feedback', () => {
  const attempt = dto.toAttempt({ ...record, status: 'PROCESSING', stage: 'COMPARISON', accuracy: null, aiFeedback: null, result: null, analyzedAt: null }, null);
  assert.equal(attempt.scores, null);
  assert.equal(attempt.aiFeedback, null);
  assert.equal(attempt.stage, 'COMPARISON');
  assert.equal(attempt.error, null);
});

test('lỗi: REJECTED dùng rejectReason, FAILED dùng errorMessage', () => {
  const rejected = dto.toAttempt({ ...record, status: 'REJECTED', rejectReason: 'Bản thu quá nhỏ.', errorCode: 'TOO_QUIET' }, null);
  assert.deepEqual(rejected.error, { code: 'TOO_QUIET', message: 'Bản thu quá nhỏ.' });
  const failed = dto.toAttempt({ ...record, status: 'FAILED', errorCode: 'EVALUATION_FAILED', errorMessage: PracticeConstant.messages.SEGMENT_FAILED }, null);
  assert.deepEqual(failed.error, { code: 'EVALUATION_FAILED', message: PracticeConstant.messages.SEGMENT_FAILED });
});

test('feedback dự phòng được đánh dấu isFallback', () => {
  const attempt = dto.toAttempt({ ...record, aiFeedback: PracticeConstant.fallbackFeedback }, null);
  assert.equal(attempt.aiFeedback?.isFallback, true);
});

test('toSummary trả điểm tổng, điểm gốc và thời điểm', () => {
  assert.deepEqual(dto.toSummary(record), {
    id: 'seg-2', startSec: 12.004, endSec: 20, status: 'COMPLETED', overall: 81, baselineOverall: 62, createdAt: at.toISOString()
  });
});
