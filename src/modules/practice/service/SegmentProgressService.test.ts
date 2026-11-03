import { test } from 'node:test';
import assert from 'node:assert/strict';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeValidation from '../validation/PracticeValidation.ts';
import SegmentProgressService from './SegmentProgressService.ts';
import type PracticeSegmentRepository from '../repository/PracticeSegmentRepository.ts';
import type RhythmClientService from '../../audio/service/RhythmClientService.ts';

const now = new Date('2026-11-03T10:00:00Z');
const baseRecord: Practice.SegmentRecord = {
  id: 'seg-1', submissionId: 'sub-1', studentId: 'student', startSec: 2, endSec: 6, studentUploadId: 'up-1', fileUrl: 'https://be/s.wav',
  status: 'PROCESSING', stage: 'QUALITY_CHECK', stageStartedAt: now, evaluationId: 'ev-seg', messageId: 'm-1', publicationState: 'published', attempt: 1,
  result: null, aiFeedback: null, accuracy: null, pitchAccuracy: null, rhythmAccuracy: null, baselineAccuracy: null, baselinePitch: null,
  baselineRhythm: null, rejectReason: null, errorCode: null, errorMessage: null, analyzedAt: null, createdAt: now, updatedAt: now
};

function setup(remote: Audio.EvaluationResponse | null = null, stored: Practice.SegmentRecord = baseRecord) {
  let current = stored;
  const writes: Practice.SegmentUpdate[] = [];
  const repository = {
    findByEvaluationId: async (evaluationId: string) => (evaluationId === current.evaluationId ? current : null),
    findById: async () => current,
    updateIfCurrent: async (_id: string, expected: { attempt: number; status: Practice.SubmissionStatus }, data: Practice.SegmentUpdate) => {
      if (current.attempt !== expected.attempt || current.status !== expected.status) return false;
      writes.push(data);
      current = { ...current, ...(data as Partial<Practice.SegmentRecord>) };
      return true;
    }
  } as unknown as PracticeSegmentRepository;
  const client = { get: async () => remote } as unknown as RhythmClientService;
  return { service: new SegmentProgressService(repository, client, () => now), read: () => current, writes };
}

const callback = (changes: Partial<Practice.SegmentProgressCallback>): Practice.SegmentProgressCallback => ({
  evaluationId: 'ev-seg', attempt: 1, job: 'feedback', status: 'done', ...changes
});
const result = (changes: Partial<Practice.SegmentResult> = {}): Practice.SegmentResult => ({
  overallScore: 81, pitchAccuracyPercent: 85, rhythmAccuracyPercent: 75, aiFeedback: 'Tốt lắm',
  baseline: { overallScore: 62, pitchAccuracyPercent: 60, rhythmAccuracyPercent: 65 }, ...changes
});

test('started chỉ tiến stage, không lùi', async () => {
  const { service, read } = setup(null, { ...baseRecord, stage: 'COMPARISON' });
  assert.equal(await service.apply(callback({ job: 'quality_check', status: 'started' })), false);
  assert.equal(read().stage, 'COMPARISON');
  assert.equal(await service.apply(callback({ job: 'feedback', status: 'started' })), true);
  assert.equal(read().stage, 'FEEDBACK');
});

test('done/feedback lưu điểm, baseline và analyzedAt', async () => {
  const { service, read } = setup();
  assert.equal(await service.apply(callback({ result: result() })), true);
  const updated = read();
  assert.deepEqual(
    { status: updated.status, accuracy: updated.accuracy, pitchAccuracy: updated.pitchAccuracy, rhythmAccuracy: updated.rhythmAccuracy,
      baselineAccuracy: updated.baselineAccuracy, baselinePitch: updated.baselinePitch, baselineRhythm: updated.baselineRhythm },
    { status: 'COMPLETED', accuracy: 81, pitchAccuracy: 85, rhythmAccuracy: 75, baselineAccuracy: 62, baselinePitch: 60, baselineRhythm: 65 }
  );
  assert.equal(updated.analyzedAt?.getTime(), now.getTime());
  assert.equal(updated.aiFeedback, 'Tốt lắm');
});

test('điểm null và baseline null vẫn COMPLETED', async () => {
  const { service, read } = setup();
  const empty = result({ overallScore: null, pitchAccuracyPercent: null, rhythmAccuracyPercent: null, baseline: null });
  assert.equal(await service.apply(callback({ result: empty })), true);
  assert.equal(read().status, 'COMPLETED');
  assert.equal(read().accuracy, null);
  assert.equal(read().baselineAccuracy, null);
});

test('segmentCallbackSchema nhận điểm null, callbackSchema vẫn từ chối', () => {
  const validation = new PracticeValidation();
  const body = { evaluationId: 'ev', attempt: 1, job: 'feedback', status: 'done',
    result: { overallScore: null, pitchAccuracyPercent: null, rhythmAccuracyPercent: null, aiFeedback: 'x' } };
  assert.equal(validation.segmentCallbackSchema.safeParse({ body, params: {}, query: {} }).success, true);
  assert.equal(validation.callbackSchema.safeParse({ body, params: {}, query: {} }).success, false);
});

test('done/feedback lần hai trả false, không ghi lại', async () => {
  const { service, writes } = setup();
  assert.equal(await service.apply(callback({ result: result() })), true);
  assert.equal(await service.apply(callback({ result: result({ overallScore: 10 }) })), false);
  assert.equal(writes.length, 1);
});

test('rejected lưu rejectReason; failed lưu SEGMENT_FAILED, không retry', async () => {
  const rejected = setup();
  await rejected.service.apply(callback({ job: 'quality_check', status: 'rejected', code: 'TOO_QUIET', reason: 'Bản thu quá nhỏ.' }));
  assert.equal(rejected.read().status, 'REJECTED');
  assert.equal(rejected.read().rejectReason, 'Bản thu quá nhỏ.');
  assert.equal(rejected.read().errorCode, 'TOO_QUIET');

  const failed = setup();
  await failed.service.apply(callback({ job: 'comparison', status: 'failed', code: 'EVALUATION_FAILED', reason: 'lỗi nội bộ' }));
  assert.equal(failed.read().status, 'FAILED');
  assert.equal(failed.read().errorMessage, PracticeConstant.messages.SEGMENT_FAILED);
  assert.equal(failed.read().stage, 'COMPARISON');
});

test('callback lệch attempt hoặc evaluationId lạ bị bỏ qua', async () => {
  const { service, read } = setup();
  assert.equal(await service.apply(callback({ attempt: 2, result: result() })), false);
  assert.equal(await service.apply(callback({ evaluationId: 'unknown', result: result() })), false);
  assert.equal(read().status, 'PROCESSING');
});

test('reconcile áp trạng thái completed từ Rhythm khi mất callback', async () => {
  const remote = { evaluationId: 'ev-seg', status: 'completed', attempt: 1, result: result(), error: null } as unknown as Audio.EvaluationResponse;
  const { service } = setup(remote);
  const reconciled = await service.reconcile(baseRecord);
  assert.equal(reconciled.status, 'COMPLETED');
  assert.equal(reconciled.accuracy, 81);
});

test('reconcile bỏ qua khi Rhythm không truy cập được hoặc job chưa publish', async () => {
  const unreachable = setup(null);
  assert.equal((await unreachable.service.reconcile(baseRecord)).status, 'PROCESSING');
  const unpublished = setup(null, { ...baseRecord, publicationState: 'publishing' });
  assert.equal((await unpublished.service.reconcile({ ...baseRecord, publicationState: 'publishing' })).status, 'PROCESSING');
});
