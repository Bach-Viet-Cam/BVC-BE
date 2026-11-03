import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import EvaluationJobBuilderService from './EvaluationJobBuilderService.ts';
import PracticeSegmentService from './PracticeSegmentService.ts';
import type PracticeSegmentRepository from '../repository/PracticeSegmentRepository.ts';
import type PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import type RhythmPublisherService from '../../audio/service/RhythmPublisherService.ts';

const now = new Date('2026-11-03T10:00:00Z');
const uploadId = '00000000-0000-4000-8000-000000000001';
const sheet: Practice.SheetTemplate = {
  id: 'sheet-bau', pieceId: 'piece-1', instrumentId: 'inst-bau', kind: 'MAIN', analysisStatus: 'READY', analysisJobId: 'analysis-1',
  referenceAudio: { storageKey: 'media/teacher.wav', status: 'READY' }, instrument: { code: 'dan_bau' }
};
const original: Practice.SegmentOrigin = {
  id: 'sub-1', studentId: 'student', status: 'COMPLETED', evaluationId: 'ev-original', result: {}, pitchChart: { durationSec: 30 }, sheetMusic: sheet
};

interface Options { origin?: Practice.SegmentOrigin | null; publishState?: Audio.PublicationState; }

function setup(options: Options = {}) {
  const jobs: Audio.Job[] = [];
  let stored: Practice.SegmentRecord | null = null;
  const repository = {
    findOriginal: async (_id: string, studentId: string) => {
      const found = options.origin === undefined ? original : options.origin;
      return found && found.studentId === studentId ? found : null;
    },
    create: async (data: Practice.SegmentCreateData) => {
      stored = {
        id: 'seg-1', submissionId: data.submissionId, studentId: data.studentId, startSec: data.startSec, endSec: data.endSec,
        studentUploadId: data.studentUploadId, fileUrl: data.fileUrl, status: 'PROCESSING', stage: 'QUALITY_CHECK', stageStartedAt: now,
        evaluationId: data.evaluationId, messageId: data.messageId, publicationState: 'publishing', attempt: 1, result: null, aiFeedback: null,
        accuracy: null, pitchAccuracy: null, rhythmAccuracy: null, baselineAccuracy: null, baselinePitch: null, baselineRhythm: null,
        rejectReason: null, errorCode: null, errorMessage: null, analyzedAt: null, createdAt: now, updatedAt: now
      };
      return stored;
    },
    findById: async () => stored,
    updatePublication: async (_id: string, data: { publicationState: string }) => { if (stored) stored = { ...stored, ...data }; },
    updateIfCurrent: async (_id: string, _expected: unknown, data: Practice.SegmentUpdate) => {
      if (stored) stored = { ...stored, ...(data as Partial<Practice.SegmentRecord>) };
      return true;
    }
  } as unknown as PracticeSegmentRepository;
  const uploads = {
    findOwnedUpload: async (ownerId: string) => (ownerId === 'student' ? { id: uploadId, url: 'https://be/s.wav' } : null)
  } as unknown as PracticeSubmissionRepository;
  const publisher = { publish: async (job: Audio.Job) => { jobs.push(job); return options.publishState ?? 'published'; } } as unknown as RhythmPublisherService;
  const jobBuilder = new EvaluationJobBuilderService(async (key) => `https://storage/${key}`, () => now);
  const service = new PracticeSegmentService({ repository, uploads, publisher, jobBuilder });
  return { service, jobs, read: () => stored };
}

const input = { startSec: 2, endSec: 6.5, studentUploadId: uploadId };
const hasStatus = (statusCode: number) => (error: unknown) => error instanceof AppError && error.statusCode === statusCode;

test('404 khi submission không thuộc học sinh', async () => {
  await assert.rejects(setup({ origin: null }).service.create('student', 'sub-1', input), hasStatus(404));
  await assert.rejects(setup().service.create('other', 'sub-1', input), hasStatus(404));
});

test('409 khi submission chưa COMPLETED, thiếu evaluationId, hoặc sheetMusic null', async () => {
  const cases = [{ status: 'PROCESSING' as const }, { evaluationId: null }, { sheetMusic: null }];
  for (const change of cases) {
    await assert.rejects(
      setup({ origin: { ...original, ...change } }).service.create('student', 'sub-1', input),
      (error) => error instanceof AppError && error.statusCode === 409 && error.message === PracticeConstant.messages.SEGMENT_NOT_READY
    );
  }
});

test('400 khi endSec vượt thời lượng bản mẫu', async () => {
  await assert.rejects(setup().service.create('student', 'sub-1', { ...input, endSec: 31 }), (error) => (
    hasStatus(400)(error) && (error as AppError).message === PracticeConstant.messages.SEGMENT_INVALID
  ));
});

test('400 khi đoạn rỗng hoặc ngược', async () => {
  await assert.rejects(setup().service.create('student', 'sub-1', { ...input, startSec: 6.5 }), hasStatus(400));
});

test('thời lượng lấy từ chất lượng bản thu khi chưa có pitch chart', async () => {
  const origin = { ...original, pitchChart: null, result: { studentAudioQuality: { audio: { durationSec: 10 } } } };
  await assert.rejects(setup({ origin }).service.create('student', 'sub-1', { ...input, endSec: 11 }), hasStatus(400));
  const segment = await setup({ origin }).service.create('student', 'sub-1', { ...input, endSec: 10 });
  assert.equal(segment.endSec, 10);
});

test('chấp nhận đoạn khi không biết thời lượng', async () => {
  const { service } = setup({ origin: { ...original, pitchChart: null, result: null } });
  const segment = await service.create('student', 'sub-1', { ...input, endSec: 999 });
  assert.equal(segment.status, 'PROCESSING');
});

test('404 khi upload không thuộc học sinh', async () => {
  const { service, jobs } = setup({ origin: { ...original, studentId: 'other' } });
  await assert.rejects(service.create('other', 'sub-1', input), hasStatus(404));
  assert.equal(jobs.length, 0);
});

test('publish job có khoảng đoạn, baselineEvaluationId và callback đoạn', async () => {
  const { service, jobs } = setup();
  const segment = await service.create('student', 'sub-1', input);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].templateStartSec, 2);
  assert.equal(jobs[0].templateEndSec, 6.5);
  assert.equal(jobs[0].baselineEvaluationId, 'ev-original');
  assert.equal(jobs[0].studentUrl, 'https://be/s.wav');
  assert.equal(jobs[0].templateAnalysisId, 'analysis-1');
  assert.ok(jobs[0].callbackUrl?.endsWith('/api/v1/internal/practice-segments/progress'));
  assert.equal(segment.status, 'PROCESSING');
  assert.equal(segment.stage, 'QUALITY_CHECK');
});

test('publish_failed → attempt FAILED với SEGMENT_FAILED', async () => {
  const { service, read } = setup({ publishState: 'publish_failed' });
  const segment = await service.create('student', 'sub-1', input);
  assert.equal(segment.status, 'FAILED');
  assert.equal(read()?.errorCode, PracticeConstant.errorCodes.PUBLISH_FAILED);
  assert.equal(read()?.errorMessage, PracticeConstant.messages.SEGMENT_FAILED);
});

// --- get / list ---------------------------------------------------------------------------------------

import SegmentProgressService from './SegmentProgressService.ts';

function readerSetup(records: Practice.SegmentRecord[]) {
  const repository = {
    findOwned: async (id: string, studentId: string) => records.find((record) => record.id === id && record.studentId === studentId) ?? null,
    findPreviousSameRange: async () => null,
    findOriginal: async (_id: string, studentId: string) => (studentId === 'student' ? original : null),
    listBySubmission: async (submissionId: string, studentId: string, page: { cursor?: string; limit: number }) => {
      const owned = records.filter((record) => record.submissionId === submissionId && record.studentId === studentId);
      const start = page.cursor ? owned.findIndex((record) => record.id === page.cursor) + 1 : 0;
      return owned.slice(start, start + page.limit);
    }
  } as unknown as PracticeSegmentRepository;
  const progress = { reconcile: async (record: Practice.SegmentRecord) => ({ ...record, status: 'COMPLETED' as const }) } as unknown as SegmentProgressService;
  return new PracticeSegmentService({ repository, progress });
}

function attempt(id: string): Practice.SegmentRecord {
  return {
    id, submissionId: 'sub-1', studentId: 'student', startSec: 1, endSec: 2, studentUploadId: null, fileUrl: null, status: 'PROCESSING', stage: 'QUALITY_CHECK',
    stageStartedAt: now, evaluationId: `ev-${id}`, messageId: `m-${id}`, publicationState: 'published', attempt: 1, result: null, aiFeedback: null,
    accuracy: null, pitchAccuracy: null, rhythmAccuracy: null, baselineAccuracy: null, baselinePitch: null, baselineRhythm: null,
    rejectReason: null, errorCode: null, errorMessage: null, analyzedAt: null, createdAt: now, updatedAt: now
  };
}

test('get: 404 khi không sở hữu, reconcile khi đang xử lý', async () => {
  const service = readerSetup([attempt('seg-1')]);
  await assert.rejects(service.get('other', 'seg-1'), hasStatus(404));
  assert.equal((await service.get('student', 'seg-1')).status, 'COMPLETED');
});

test('list trả nextCursor khi còn trang', async () => {
  const service = readerSetup(['a', 'b', 'c'].map(attempt));
  const first = await service.list('student', 'sub-1', { limit: 2 });
  assert.deepEqual(first.items.map((item) => item.id), ['a', 'b']);
  assert.equal(first.nextCursor, 'b');
  const second = await service.list('student', 'sub-1', { cursor: first.nextCursor ?? undefined, limit: 2 });
  assert.deepEqual(second.items.map((item) => item.id), ['c']);
  assert.equal(second.nextCursor, null);
});

// --- pitch chart --------------------------------------------------------------------------------------

function chartSetup(changes: Partial<Practice.SegmentRecord>) {
  const completed = {
    ...attempt('seg-1'), status: 'COMPLETED' as const, startSec: 10, endSec: 12, accuracy: 80,
    result: {
      overallScore: 80, pitchAccuracyPercent: 80, rhythmAccuracyPercent: 80, aiFeedback: 'x',
      pitchErrorSegments: [{ startTime: 10.25, endTime: 10.75, averageCentsDifference: 90 }],
      pitch: { sampleRate: 2, hopLength: 1, teacherF0Hz: [220, 220, null, 330], studentF0Hz: [221, null, 333], studentFrameByTeacherFrame: [0, 0, 1, 2] }
    },
    ...changes
  };
  return readerSetup([completed]);
}

test('pitch-chart: dựng từ result.pitch, thời gian tính từ đầu đoạn', async () => {
  const chart = await chartSetup({}).getPitchChart('student', 'seg-1');
  assert.deepEqual(chart.points[0], [0, 220, 221]);
  assert.equal(chart.durationSec, 2);
  assert.deepEqual(chart.segments.map((segment) => [segment.id, segment.startSec, segment.endSec]), [['p0', 0.25, 0.75]]);
});

test('pitch-chart: 404 khi không sở hữu, 409 khi đang xử lý, 422 khi thiếu dữ liệu cao độ', async () => {
  await assert.rejects(chartSetup({}).getPitchChart('other', 'seg-1'), hasStatus(404));
  await assert.rejects(readerSetup([attempt('seg-1')]).getPitchChart('student', 'seg-1'), hasStatus(409));
  await assert.rejects(chartSetup({ result: { overallScore: 80, aiFeedback: 'x' } }).getPitchChart('student', 'seg-1'), hasStatus(422));
});
