import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import SubmissionCompareService from './SubmissionCompareService.ts';
import type PitchChartService from './PitchChartService.ts';
import type PracticeResultRepository from '../repository/PracticeResultRepository.ts';

const { messages } = PracticeConstant;

function record(id: string, createdAt: string, overrides: Partial<Practice.ResultRecord> = {}): Practice.ResultRecord {
  return {
    id, studentId: 'student', pieceId: 'piece-1', sheetMusicId: 'sheet-1', assignmentId: null, status: 'COMPLETED', accuracy: 80.4,
    aiFeedback: null, pitchChart: null, evaluationId: `eval-${id}`, fileDeletedAt: null, analyzedAt: new Date(createdAt),
    createdAt: new Date(createdAt),
    result: { pitchErrorSegments: [{ startTime: 12.4, endTime: 13.1, averageCentsDifference: -24.4 }], rhythmSegments: [] },
    piece: { id: 'piece-1', title: 'Lý ngựa ô' },
    sheetMusic: { id: 'sheet-1', name: 'Bản chính', referenceAudio: null },
    assignment: null, studentUpload: null, ...overrides
  };
}

const older = record('sub-old', '2026-10-20T07:00:00Z');
const newer = record('sub-new', '2026-10-24T07:00:00Z');

const chart: Practice.PitchChartDTO = {
  durationSec: 1, minHz: 200, maxHz: 300, points: [[0, 220, 210], [1, 230, 225]], segments: [], timeMap: []
};

interface SetupOptions {
  records?: Record<string, Practice.ResultRecord | null>;
  attempts?: Record<string, number>;
  failChartFor?: string;
}

function setup(options: SetupOptions = {}) {
  const records = options.records ?? { 'sub-old': older, 'sub-new': newer };
  const attempts = options.attempts ?? { 'sub-old': 2, 'sub-new': 5 };
  const repository = {
    findOwnedResult: async (id: string) => records[id] ?? null,
    countCompletedUntil: async (found: Practice.ResultRecord) => attempts[found.id] ?? 1
  } as unknown as PracticeResultRepository;
  const pitchCharts = {
    getChart: async (found: Practice.ResultRecord) => {
      if (found.id === options.failChartFor) throw new AppError(messages.PITCH_UNAVAILABLE, 422);
      return chart;
    }
  } as unknown as PitchChartService;
  return new SubmissionCompareService({ repository, pitchCharts });
}

const hasStatus = (statusCode: number, message: string) => (error: unknown) => (
  error instanceof AppError && error.statusCode === statusCode && error.message === message
);

test('không thuộc học sinh thì 404', async () => {
  const service = setup({ records: { 'sub-old': older, 'sub-new': null } });
  await assert.rejects(service.compare('student', 'sub-old', 'sub-new'), hasStatus(404, messages.SUBMISSION_NOT_FOUND));
});

test('bài chưa phân tích xong thì 409', async () => {
  const service = setup({ records: { 'sub-old': older, 'sub-new': { ...newer, status: 'PROCESSING' } } });
  await assert.rejects(service.compare('student', 'sub-old', 'sub-new'), hasStatus(409, messages.RESULT_PROCESSING));
});

test('khác bản nhạc thì 400', async () => {
  const service = setup({ records: { 'sub-old': older, 'sub-new': { ...newer, sheetMusicId: 'sheet-2' } } });
  await assert.rejects(service.compare('student', 'sub-old', 'sub-new'), hasStatus(400, messages.COMPARE_DIFFERENT_SHEET));
});

test('sheetMusicId null thì 400', async () => {
  const service = setup({ records: { 'sub-old': { ...older, sheetMusicId: null }, 'sub-new': { ...newer, sheetMusicId: null } } });
  await assert.rejects(service.compare('student', 'sub-old', 'sub-new'), hasStatus(400, messages.COMPARE_DIFFERENT_SHEET));
});

test('không có dữ liệu cao độ thì 422 kèm submissionId', async () => {
  const service = setup({ failChartFor: 'sub-old' });
  await assert.rejects(service.compare('student', 'sub-old', 'sub-new'), (error) => (
    error instanceof AppError && error.statusCode === 422 && error.message === messages.PITCH_UNAVAILABLE
    && error.details?.submissionId === 'sub-old'
  ));
});

test('đảo a và b vẫn cùng older/newer', async () => {
  const service = setup();
  const forward = await service.compare('student', 'sub-old', 'sub-new');
  const reverse = await service.compare('student', 'sub-new', 'sub-old');
  assert.equal(forward.older.submissionId, 'sub-old');
  assert.equal(reverse.older.submissionId, 'sub-old');
  assert.equal(reverse.newer.submissionId, 'sub-new');
});

test('result cũ thiếu trường vẫn so sánh được', async () => {
  const service = setup({ records: { 'sub-old': { ...older, result: {} }, 'sub-new': { ...newer, result: {} } } });
  const result = await service.compare('student', 'sub-old', 'sub-new');
  assert.deepEqual(result.segments, []);
  assert.equal(result.noSegmentsToCompare, true);
});

test('trả đủ piece, sheetMusic, attemptNo và segments', async () => {
  const result = await setup().compare('student', 'sub-old', 'sub-new');
  assert.deepEqual(result.piece, { id: 'piece-1', title: 'Lý ngựa ô' });
  assert.deepEqual(result.sheetMusic, { id: 'sheet-1', name: 'Bản chính' });
  assert.equal(result.older.attemptNo, 2);
  assert.equal(result.newer.attemptNo, 5);
  assert.deepEqual(result.segments.map((segment) => [segment.id, segment.status, segment.olderLabel, segment.newerLabel]), [
    ['pitch-12.4-REPEATED', 'REPEATED', 'Lệch -24¢', 'Lệch -24¢']
  ]);
  assert.equal(result.noSegmentsToCompare, false);
  assert.deepEqual(result.chart.points, [[0, 220, 210, 210], [1, 230, 225, 225]]);
});
