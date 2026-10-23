import { test } from 'node:test';
import assert from 'node:assert/strict';
import SubmissionProgressService from './SubmissionProgressService.ts';
import type PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import type PracticeFileService from './PracticeFileService.ts';
import type RhythmClientService from '../../audio/service/RhythmClientService.ts';

const startedAt = new Date('2026-10-22T10:00:00Z');
const result = { overallScore: 82, pitchAccuracyPercent: 80, rhythmAccuracyPercent: 84, aiFeedback: 'Tốt', teacherTempoBpm: 100, studentTempoBpm: 95 };

function makeRecord(overrides: Partial<Practice.SubmissionRecord> = {}): Practice.SubmissionRecord {
  return {
    id: 'sub-1', studentId: 'student', pieceId: 'piece', sheetMusicId: 'sheet', assignmentId: null, status: 'PROCESSING',
    stage: 'QUALITY_CHECK', stageStartedAt: startedAt, attempt: 1, retryCount: 0, retryAvailableAt: null, fileDeletedAt: null,
    fileUrl: 'https://be/s.wav', evaluationId: 'eval-1', messageId: 'msg-1', publicationState: 'published', rejectReason: null,
    errorCode: null, errorMessage: null, analyzedAt: null, createdAt: startedAt, studentUpload: { id: 'upload', key: 'audio/s.wav' },
    ...overrides
  };
}

function setup(record: Practice.SubmissionRecord, options: { now?: Date; remote?: Audio.EvaluationResponse | null } = {}) {
  let current = { ...record };
  const deleted: string[] = [];
  const repository = {
    findByEvaluationId: async () => current,
    findById: async () => current,
    updateIfCurrent: async (_id: string, expected: { attempt: number; status: Practice.SubmissionStatus }, data: Practice.SubmissionUpdate) => {
      if (current.attempt !== expected.attempt || current.status !== expected.status) return false;
      current = { ...current, ...(data as Partial<Practice.SubmissionRecord>) };
      return true;
    }
  } as unknown as PracticeSubmissionRepository;
  const files = { deleteStudentFile: async (submission: Practice.SubmissionRecord) => { deleted.push(submission.id); } } as unknown as PracticeFileService;
  const client = { get: async () => options.remote ?? null } as unknown as RhythmClientService;
  const service = new SubmissionProgressService(repository, files, client, () => options.now ?? new Date(startedAt.getTime() + 2_000));
  return { service, deleted, read: () => current as Practice.SubmissionRecord & { accuracy?: number; tempoDeviation?: number; aiFeedback?: string } };
}

const callback = (overrides: Partial<Practice.ProgressCallback>): Practice.ProgressCallback => ({ evaluationId: 'eval-1', attempt: 1, job: 'audio_analysis', status: 'started', ...overrides });

test('Bước bắt đầu cập nhật stage theo thứ tự, không lùi lại và bỏ qua lượt cũ', async () => {
  const { service, read } = setup(makeRecord());
  assert.equal(await service.apply(callback({ job: 'comparison' })), true);
  assert.equal(read().stage, 'COMPARISON');
  assert.equal(await service.apply(callback({ job: 'audio_analysis' })), false);
  assert.equal(await service.apply(callback({ job: 'feedback', attempt: 2 })), false);
  assert.equal(read().stage, 'COMPARISON');
});

test('Hoàn tất lưu kết quả, accuracy, độ lệch tempo và nhận xét; callback lặp lại bị bỏ qua', async () => {
  const { service, read } = setup(makeRecord({ stage: 'FEEDBACK' }));
  assert.equal(await service.apply(callback({ job: 'feedback', status: 'done', result })), true);
  const saved = read();
  assert.equal(saved.status, 'COMPLETED');
  assert.equal(saved.accuracy, 82);
  assert.equal(saved.tempoDeviation, -5);
  assert.equal(saved.aiFeedback, 'Tốt');
  assert.equal(await service.apply(callback({ job: 'feedback', status: 'done', result })), false);
});

test('Bước JOB-02/03 xong không đổi trạng thái', async () => {
  const { service, read } = setup(makeRecord({ stage: 'AUDIO_ANALYSIS' }));
  assert.equal(await service.apply(callback({ status: 'done' })), false);
  assert.equal(read().status, 'PROCESSING');
});

test('Từ chối chất lượng lưu lý do và không bị tính (REJECTED)', async () => {
  const { service, read } = setup(makeRecord());
  await service.apply(callback({ job: 'quality_check', status: 'rejected', reason: 'Âm lượng quá nhỏ', code: 'LOW_VOLUME' }));
  assert.equal(read().status, 'REJECTED');
  assert.equal(read().rejectReason, 'Âm lượng quá nhỏ');
});

test('Lỗi lần đầu mở thử lại sau 5 giây, các lần sau 10 giây, hết lượt thì xóa file', async () => {
  const now = new Date(startedAt.getTime() + 2_000);
  const first = setup(makeRecord(), { now });
  await first.service.apply(callback({ job: 'feedback', status: 'failed', code: 'EVALUATION_FAILED', reason: 'Gemini lỗi' }));
  assert.equal(first.read().status, 'FAILED');
  assert.equal(first.read().stage, 'FEEDBACK');
  assert.equal(first.read().retryAvailableAt?.getTime(), now.getTime() + 5_000);
  assert.equal(first.read().errorMessage, 'Gemini lỗi');

  const later = setup(makeRecord({ retryCount: 1, attempt: 2 }), { now });
  await later.service.apply(callback({ attempt: 2, status: 'failed' }));
  assert.equal(later.read().retryAvailableAt?.getTime(), now.getTime() + 10_000);
  assert.deepEqual(later.deleted, []);

  const last = setup(makeRecord({ retryCount: 3, attempt: 4 }), { now });
  await last.service.apply(callback({ attempt: 4, status: 'failed' }));
  assert.equal(last.read().retryAvailableAt, null);
  assert.deepEqual(last.deleted, ['sub-1']);
});

test('Bước chạy quá 1 phút không có tin từ Rhythm thì chuyển Lỗi xử lý (JOB_TIMEOUT)', async () => {
  const late = new Date(startedAt.getTime() + 71_000);
  const silent = setup(makeRecord(), { now: late, remote: { evaluationId: 'eval-1', status: 'processing', stage: 'quality_check', attempt: 1, result: null, error: null } });
  const reconciled = await silent.service.reconcile(makeRecord());
  assert.equal(reconciled.status, 'FAILED');
  assert.equal(reconciled.errorCode, 'JOB_TIMEOUT');

  const fresh = setup(makeRecord(), { now: new Date(startedAt.getTime() + 30_000) });
  assert.equal((await fresh.service.reconcile(makeRecord())).status, 'PROCESSING');
});

test('Callback bị mất thì đối soát theo trạng thái của Rhythm', async () => {
  const late = new Date(startedAt.getTime() + 71_000);
  const completed = setup(makeRecord({ stage: 'FEEDBACK' }), { now: late, remote: { evaluationId: 'eval-1', status: 'completed', stage: 'feedback', attempt: 1, result, error: null } });
  assert.equal((await completed.service.reconcile(makeRecord({ stage: 'FEEDBACK' }))).status, 'COMPLETED');

  const advanced = setup(makeRecord(), { now: late, remote: { evaluationId: 'eval-1', status: 'processing', stage: 'comparison', attempt: 1, result: null, error: null } });
  const moved = await advanced.service.reconcile(makeRecord());
  assert.equal(moved.status, 'PROCESSING');
  assert.equal(moved.stage, 'COMPARISON');
});
