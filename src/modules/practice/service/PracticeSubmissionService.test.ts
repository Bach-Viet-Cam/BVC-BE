import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import PracticeSubmissionService from './PracticeSubmissionService.ts';
import SubmissionProgressService from './SubmissionProgressService.ts';
import type PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import type PracticeFileService from './PracticeFileService.ts';
import type RhythmClientService from '../../audio/service/RhythmClientService.ts';
import type RhythmPublisherService from '../../audio/service/RhythmPublisherService.ts';

const now = new Date('2026-10-22T10:00:00Z');
const input: Practice.CreateInput = { pieceId: 'piece-1', sheetMusicId: 'sheet-bau', studentUploadId: '00000000-0000-4000-8000-000000000001' };
const sheet: Practice.SheetTemplate = { id: 'sheet-bau', pieceId: 'piece-1', instrumentId: 'inst-bau', kind: 'MAIN', referenceAudio: { storageKey: 'media/teacher.wav', status: 'READY' }, instrument: { code: 'dan_bau' } };
const candidate: Practice.AssignmentCandidate = {
  id: 'asg-1', title: 'Bài 3', description: '', status: 'PUBLISHED', deadline: new Date('2026-12-01'), maxSubmissions: 3, targetBpm: null,
  currentVersionId: 'version-1', submissions: []
};
const enrollment: Practice.ClassAssignments = { classRecord: { id: 'class-1', name: 'Lớp K18A', status: 'ACTIVE', instrumentId: 'inst-bau' }, assignments: [candidate] };

interface Options {
  publishState?: Audio.PublicationState;
  busyId?: string | null;
  sheet?: Practice.SheetTemplate | null;
  enrollment?: Practice.ClassAssignments | null;
  stored?: Practice.SubmissionRecord;
  isKnownToRhythm?: boolean;
}

function setup(options: Options = {}) {
  let current: Practice.SubmissionRecord | null = options.stored ?? null;
  const jobs: Audio.Job[] = [];
  const retries: { fromJob: string; attempt: number }[] = [];
  const created: Practice.SubmissionCreateData[] = [];
  const repository = {
    findOwnedUpload: async (ownerId: string) => (ownerId === 'student' ? { id: input.studentUploadId, url: 'https://be/s.wav' } : null),
    findSheet: async () => (options.sheet === undefined ? sheet : options.sheet),
    findClassAssignments: async () => (options.enrollment === undefined ? enrollment : options.enrollment),
    createIfIdle: async (data: Practice.SubmissionCreateData) => {
      if (options.busyId) return { submission: null, busyId: options.busyId };
      created.push(data);
      current = {
        id: 'sub-1', studentId: data.studentId, pieceId: data.pieceId, sheetMusicId: data.sheetMusicId, assignmentId: data.assignmentId,
        status: 'PROCESSING', stage: 'QUALITY_CHECK', stageStartedAt: now, attempt: 1, retryCount: 0, retryAvailableAt: null,
        fileDeletedAt: null, fileUrl: data.fileUrl, evaluationId: data.evaluationId, messageId: data.messageId, publicationState: 'publishing',
        rejectReason: null, errorCode: null, errorMessage: null, analyzedAt: null, createdAt: now, studentUpload: { id: data.studentUploadId, key: 'audio/s.wav' }
      };
      return { submission: current, busyId: null };
    },
    findOwned: async () => current,
    findById: async () => current,
    updatePublication: async (_id: string, data: { publicationState: string }) => { if (current) current = { ...current, ...data }; },
    updateIfCurrent: async (_id: string, expected: { attempt: number; status: Practice.SubmissionStatus }, data: Practice.SubmissionUpdate) => {
      if (!current || current.attempt !== expected.attempt || current.status !== expected.status) return false;
      current = { ...current, ...(data as Partial<Practice.SubmissionRecord>) };
      return true;
    }
  } as unknown as PracticeSubmissionRepository;
  const publisher = { publish: async (job: Audio.Job) => { jobs.push(job); return options.publishState ?? 'published'; } } as unknown as RhythmPublisherService;
  const client = {
    retry: async (_id: string, fromJob: string, attempt: number) => { retries.push({ fromJob, attempt }); return options.isKnownToRhythm ?? true; },
    get: async () => null
  } as unknown as RhythmClientService;
  const files = { deleteStudentFile: async () => undefined } as unknown as PracticeFileService;
  const progress = new SubmissionProgressService(repository, files, client, () => now);
  const service = new PracticeSubmissionService({
    repository, progress, publisher, client, now: () => now,
    createReadUrl: async (key: string) => `https://storage/${key}?signed`
  });
  return { service, jobs, retries, created, read: () => current };
}

const hasStatus = (statusCode: number) => (error: unknown) => error instanceof AppError && error.statusCode === statusCode;

test('Gửi bản thu tạo Submission Đang xử lý và gửi job theo bản nhạc học viên đã chọn', async () => {
  const { service, jobs } = setup();
  const submission = await service.create('student', input);
  assert.equal(submission.status, 'PROCESSING');
  assert.equal(submission.stage, 'QUALITY_CHECK');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].instrumentId, 'dan_bau'); // sheet instrument, not the class instrument
  assert.equal(jobs[0].templateUrl, 'https://storage/media/teacher.wav?signed');
  assert.equal(jobs[0].studentUrl, 'https://be/s.wav');
  assert.equal(jobs[0].attempt, 1);
  assert.match(jobs[0].callbackUrl ?? '', /\/api\/v1\/internal\/practice-submissions\/progress$/);
});

test('GBR-49: bài đang xử lý của cùng bản nhạc trả về 409 kèm mã bản nộp', async () => {
  const { service } = setup({ busyId: 'sub-old' });
  await assert.rejects(service.create('student', input), (error) => error instanceof AppError && error.statusCode === 409 && error.details?.submissionId === 'sub-old');
});

test('Bản nhạc sai, chưa có bản thu mẫu hoặc file không thuộc học viên đều bị từ chối', async () => {
  await assert.rejects(setup({ sheet: null }).service.create('student', input), hasStatus(404));
  await assert.rejects(setup({ sheet: { ...sheet, referenceAudio: null } }).service.create('student', input), hasStatus(422));
  await assert.rejects(setup().service.create('other-student', input), hasStatus(400));
});

const withCandidate = (changes: Partial<Practice.AssignmentCandidate>): Practice.ClassAssignments => ({ ...enrollment, assignments: [{ ...candidate, ...changes }] });

test('Bản chính của nhạc cụ lớp được tính vào bài tập, kể cả khi client không gửi assignmentId', async () => {
  const auto = setup();
  await auto.service.create('student', input);
  assert.equal(auto.created[0].assignmentId, 'asg-1');
  assert.equal(auto.created[0].assignmentVersionId, 'version-1');
  const hinted = setup();
  await hinted.service.create('student', { ...input, assignmentId: 'asg-1' });
  assert.equal(hinted.created[0].assignmentId, 'asg-1');
});

test('Lượt bị từ chối hoặc lỗi không tính; đủ lượt thì luyện tập thường', async () => {
  const notCounted = withCandidate({ submissions: [{ status: 'REJECTED' }, { status: 'FAILED' }, { status: 'COMPLETED' }] });
  const stillOpen = setup({ enrollment: notCounted });
  await stillOpen.service.create('student', input);
  assert.equal(stillOpen.created[0].assignmentId, 'asg-1');
  const used = setup({ enrollment: withCandidate({ submissions: [{ status: 'COMPLETED' }, { status: 'PROCESSING' }, { status: 'COMPLETED' }] }) });
  await used.service.create('student', input);
  assert.equal(used.created[0].assignmentId, null);
});

test('Bản không phải MAIN, nhạc cụ khác, chưa có lớp, quá hạn hoặc lớp đã kết thúc: không tính vào bài tập và không bị chặn', async () => {
  const cases: Options[] = [
    { sheet: { ...sheet, kind: 'LEVEL' } },
    { sheet: { ...sheet, instrumentId: 'inst-other' } },
    { enrollment: null },
    { enrollment: withCandidate({ deadline: new Date('2026-10-01') }) },
    { enrollment: { ...enrollment, classRecord: { ...enrollment.classRecord, status: 'ENDED' } } },
    { enrollment: withCandidate({ status: 'CLOSED' }) }
  ];
  for (const options of cases) {
    const run = setup(options);
    await run.service.create('student', { ...input, assignmentId: 'asg-1' });
    assert.equal(run.created[0].assignmentId, null);
    assert.equal(run.created[0].assignmentVersionId, null);
  }
});

test('Gửi hàng đợi thất bại thì chuyển Lỗi xử lý và cho thử lại', async () => {
  const { service } = setup({ publishState: 'publish_failed' });
  const submission = await service.create('student', input);
  assert.equal(submission.status, 'FAILED');
  assert.equal(submission.retryAvailableAt, new Date(now.getTime() + 5_000).toISOString());
});

const failedRecord = (overrides: Partial<Practice.SubmissionRecord> = {}): Practice.SubmissionRecord => ({
  id: 'sub-1', studentId: 'student', pieceId: 'piece-1', sheetMusicId: 'sheet-bau', assignmentId: null, status: 'FAILED', stage: 'FEEDBACK',
  stageStartedAt: now, attempt: 1, retryCount: 0, retryAvailableAt: new Date(now.getTime() - 1), fileDeletedAt: null, fileUrl: 'https://be/s.wav',
  evaluationId: 'eval-1', messageId: 'msg-1', publicationState: 'published', rejectReason: null, errorCode: 'EVALUATION_FAILED',
  errorMessage: 'lỗi', analyzedAt: null, createdAt: now, studentUpload: { id: 'upload', key: 'audio/s.wav' }, ...overrides
});

test('Thử lại chạy lại từ bước bị lỗi với lượt mới', async () => {
  const { service, retries, read } = setup({ stored: failedRecord() });
  const submission = await service.retry('student', 'sub-1');
  assert.equal(submission.status, 'PROCESSING');
  assert.equal(submission.retryCount, 1);
  assert.deepEqual(retries, [{ fromJob: 'feedback', attempt: 2 }]);
  assert.equal(read()?.attempt, 2);
});

test('Thử lại khi job chưa tới Rhythm thì gửi lại job với lượt mới', async () => {
  const { service, jobs } = setup({ stored: failedRecord({ publicationState: 'publish_failed', stage: 'QUALITY_CHECK' }) });
  await service.retry('student', 'sub-1');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].attempt, 2);
  assert.notEqual(jobs[0].messageId, 'msg-1');
});

test('Không cho thử lại quá sớm, khi hết lượt hoặc khi bản nộp không lỗi', async () => {
  await assert.rejects(setup({ stored: failedRecord({ retryAvailableAt: new Date(now.getTime() + 3_000) }) }).service.retry('student', 'sub-1'), hasStatus(409));
  await assert.rejects(setup({ stored: failedRecord({ retryCount: 3 }) }).service.retry('student', 'sub-1'), hasStatus(409));
  await assert.rejects(setup({ stored: failedRecord({ status: 'COMPLETED' }) }).service.retry('student', 'sub-1'), hasStatus(409));
});
