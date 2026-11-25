import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SampleMediaFactory from '../../prisma/seed/SampleMediaFactory.ts';
import F from './PracticeCommunityFixture.ts';
import TestDatabase from './TestDatabase.ts';

type TestUser = Awaited<ReturnType<typeof TestDatabase.createUser>>;
type Submission = Awaited<ReturnType<typeof F.createSubmission>>;
type Upload = Awaited<ReturnType<typeof F.createUpload>>;

const M = F.messages;

describe('Report 5.2 – Practice Submissions (UC-02, UC-04)', () => {
  let gvA: TestUser;
  let sv1: TestUser;
  let sv2: TestUser;
  let tranhId: string;
  let classId: string;
  let p1: string;
  let s1: string;
  let as1: string;
  let up1: Upload;
  let publish: ReturnType<typeof F.stubRhythm>['publish'];

  // Class $C1 (Đàn tranh) of GV-A has SV-1; assignment $AS1 (SOLO, max 3, BPM 72) uses the ready main sheet $S1
  beforeEach(async () => {
    ({ publish } = F.stubRhythm());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await TestDatabase.reset();
    gvA = await F.teacher('GV-A');
    sv1 = await F.student('SV-1');
    sv2 = await F.student('SV-2');
    tranhId = (await TestDatabase.createInstrument('Đàn tranh')).id;
    classId = (await TestDatabase.createClass(gvA.id, tranhId, { name: 'Lớp C1' })).id;
    await TestDatabase.addMember(classId, sv1.id, gvA.id);
    p1 = (await F.createSong(tranhId, 'Lý ngựa ô')).id;
    s1 = (await F.createSheet(p1, tranhId)).id;
    as1 = (await TestDatabase.createAssignment(classId, gvA.id, { kind: 'SOLO', sheetMusicId: s1, requiredBpm: 72 })).id;
    await TestDatabase.prisma.assignment.update({ where: { id: as1 }, data: { maxSubmissions: 3 } });
    up1 = await F.createUpload(sv1.id);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const submissions = '/practice/submissions';
  const submit = (body: object, user?: TestUser) => F.post(submissions, body, user);

  // $SUB1: COMPLETED on $S1 for $AS1, accuracy 82.5, 30 seconds long
  const completed = (overrides: Partial<Submission> = {}) => F.createSubmission({
    studentId: sv1.id, pieceId: p1, sheetMusicId: s1, assignmentId: as1, accuracy: 82.5, aiFeedback: 'Giữ nhịp tốt.',
    result: F.analysisResult(), studentUploadId: up1.id, ...(overrides as object)
  });

  // $SUB: PROCESSING on $S1
  const processing = (overrides: Partial<Submission> = {}) => F.createSubmission({
    studentId: sv1.id, pieceId: p1, sheetMusicId: s1, assignmentId: as1, status: 'PROCESSING', studentUploadId: up1.id, ...(overrides as object)
  });

  async function secondSheet() {
    const pieceId = (await F.createSong(tranhId, 'Trống cơm')).id;
    return { pieceId, sheetMusicId: (await F.createSheet(pieceId, tranhId)).id };
  }

  const segmentBody = (overrides: object = {}) => ({ startSec: 2, endSec: 6.5, studentUploadId: up1.id, ...overrides });
  const doneCallback = (evaluationId: string, result?: object) => ({ evaluationId, attempt: 1, job: 'feedback', status: 'done', ...(result ? { result } : {}) });

  describe('Record screen (GET /practice/context, /practice/target-bpm, /practice/sheets/:sheetMusicId/tunes)', () => {
    it('ITC-PR-001 record screen data when the sheet belongs to an open assignment', async () => {
      const tunes = [['Sol', 196], ['La', 220], ['Đô', 261.63]] as const;
      for (const [index, [tuneName, pitch]] of tunes.entries()) {
        await TestDatabase.prisma.instrumentTune.create({ data: { instrumentId: tranhId, tuneName, pitch, displayOrder: index } });
      }
      const context = await F.get(`/practice/context?sheetMusicId=${s1}`, sv1);
      expect(context.status).toBe(200);
      expect(context.body.data.enrollment).toBe('IN_CLASS');
      expect(context.body.data.assignment).toMatchObject({ id: as1, usedSubmissions: 0, remainingSubmissions: 3, state: 'OPEN', countsTowardAssignment: true });
      expect(context.body.data.sheet.referenceAudio.url).toEqual(expect.any(String));

      const bpm = await F.get(`/practice/target-bpm?sheetMusicId=${s1}`, sv1);
      expect(bpm.status).toBe(200);
      expect(bpm.body.data).toEqual({ targetBpm: 72, source: 'ASSIGNMENT', assignmentId: as1 });

      const strings = await F.get(`/practice/sheets/${s1}/tunes`, sv1);
      expect(strings.status).toBe(200);
      expect(strings.body.data.instrument).toEqual({ id: tranhId, name: 'Đàn tranh' });
      expect(strings.body.data.tunes.map((tune: { name: string; pitchHz: number }) => [tune.name, tune.pitchHz])).toEqual(tunes.map((tune) => [...tune]));
    });

    it('ITC-PR-002 a student outside the class / a non-main sheet / a lecturer', async () => {
      const sv9 = await F.student('SV-9');
      const levelSheet = await F.createSheet(p1, tranhId, { kind: 'LEVEL' });

      const context = await F.get(`/practice/context?sheetMusicId=${s1}`, sv9);
      expect(context.status).toBe(200);
      expect(context.body.data).toMatchObject({ enrollment: 'NO_CLASS', assignment: null });

      const bpm = await F.get(`/practice/target-bpm?sheetMusicId=${s1}`, sv9);
      expect(bpm.status).toBe(200);
      expect(bpm.body.data).toMatchObject({ targetBpm: 60, source: 'DEFAULT' });

      const level = await F.get(`/practice/context?sheetMusicId=${levelSheet.id}`, sv9);
      expect(level.status).toBe(200);
      expect(level.body.data.sheet.practice).toEqual({ isAvailable: false, reason: 'Hãy luyện bản chính của nhạc cụ này.' });

      F.expectForbiddenRole(await F.get(`/practice/context?sheetMusicId=${s1}`, gvA));
    });
  });

  describe('Submit and progress (POST /practice/submissions, GET /submissions/active, GET /submissions/:id, POST /:id/retry, POST /internal/practice-submissions/progress)', () => {
    it('ITC-PR-003 a submission counts toward the assignment and publishes a Rhythm job', async () => {
      const response = await submit({ sheetMusicId: s1, assignmentId: as1, studentUploadId: up1.id }, sv1);
      expect(response.status).toBe(202);
      expect(response.body.message).toBe('Đã gửi bản thu. Hệ thống đang xử lý.');
      expect(response.body.data.status).toBe('PROCESSING');

      const stored = await TestDatabase.prisma.submission.findFirstOrThrow({ where: { studentId: sv1.id } });
      expect(response.body.data.id).toBe(stored.id);
      expect(stored).toMatchObject({ assignmentId: as1, status: 'PROCESSING', publicationState: 'published' });
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish.mock.calls[0][0]).toMatchObject({ evaluationId: stored.evaluationId, attempt: 1 });
    });

    it('ITC-PR-004 a new submission is blocked while the previous one is processing (GBR-49)', async () => {
      const sub = await processing();
      const up2 = await F.createUpload(sv1.id);

      const active = await F.get(`${submissions}/active?sheetMusicId=${s1}`, sv1);
      expect(active.status).toBe(200);
      expect(active.body.data).toMatchObject({ id: sub.id, status: 'PROCESSING' });

      F.expectError(await submit({ sheetMusicId: s1, studentUploadId: up2.id }, sv1), 409, {
        message: 'Bản nộp trước đang được xử lý. Vui lòng đợi hoàn tất rồi nộp bản mới.', data: { submissionId: sub.id }
      });
    });

    it("ITC-PR-005 someone else's / unknown upload and a bad body", async () => {
      const up2 = await F.createUpload(sv2.id);
      F.expectError(await submit({ sheetMusicId: s1, studentUploadId: up2.id }, sv1), 400, { message: M.uploadInvalid });
      F.expectValidationError(await submit({ sheetMusicId: s1, studentUploadId: 'up-1' }, sv1), 'studentUploadId');
      F.expectBodyError(await submit({ sheetMusicId: s1, studentUploadId: up1.id, accuracy: 100 }, sv1), 'accuracy');
    });

    it('ITC-PR-006 a sheet without a reference recording', async () => {
      const pieceId = (await F.createSong(tranhId, 'Bài chưa có bản thu')).id;
      const s3 = await F.createSheet(pieceId, tranhId, { hasReferenceAudio: false });
      F.expectError(await submit({ sheetMusicId: s3.id, studentUploadId: up1.id }, sv1), 422, {
        message: 'Bản nhạc này chưa có bản thu mẫu nên chưa thể phân tích.'
      });
    });

    it('ITC-PR-007 Rhythm callbacks stage by stage until completion', async () => {
      const sub = await processing();
      const evaluationId = sub.evaluationId as string;
      const stored = () => TestDatabase.prisma.submission.findUniqueOrThrow({ where: { id: sub.id } });

      const comparison = await F.callback('practice-submissions', { evaluationId, attempt: 1, job: 'comparison', status: 'started' });
      expect(comparison.status).toBe(200);
      expect((await stored()).stage).toBe('COMPARISON');

      const late = await F.callback('practice-submissions', { evaluationId, attempt: 1, job: 'quality_check', status: 'started' });
      expect(late.status).toBe(200);
      expect((await stored()).stage).toBe('COMPARISON');

      const done = await F.callback('practice-submissions', doneCallback(evaluationId, {
        overallScore: 82.5, pitchAccuracyPercent: 80, rhythmAccuracyPercent: 85, aiFeedback: 'Giữ nhịp tốt.'
      }));
      expect(done.status).toBe(200);
      expect(await stored()).toMatchObject({ status: 'COMPLETED', accuracy: 82.5 });
    });

    it('ITC-PR-008 a callback with a wrong secret / without a result', async () => {
      const evaluationId = (await processing()).evaluationId as string;
      F.expectError(
        await F.callback('practice-submissions', { evaluationId, attempt: 1, job: 'comparison', status: 'started' }, 'wrong-secret'),
        401, { message: 'Callback secret không hợp lệ.' }
      );
      const missing = await F.callback('practice-submissions', doneCallback(evaluationId));
      F.expectError(missing, 400, { message: M.invalidData });
      expect(missing.body.errors[0].message).toBe('Thiếu kết quả phân tích.');
    });

    it('ITC-PR-009 a retry after failure and the waiting time', async () => {
      const sub1 = await completed();
      const up2 = await F.createUpload(sv1.id);
      const sub = await processing({ status: 'FAILED', studentUploadId: up2.id, retryAvailableAt: new Date(Date.now() + 5_000) });

      F.expectError(await F.post(`${submissions}/${sub.id}/retry`, {}, sv1), 409, { message: M.retryTooEarly });

      await new Promise((resolve) => setTimeout(resolve, 5_100));
      const retried = await F.post(`${submissions}/${sub.id}/retry`, {}, sv1);
      expect(retried.status).toBe(202);
      expect(retried.body.message).toBe('Đang xử lý lại bản thu...');
      expect(retried.body.data).toMatchObject({ status: 'PROCESSING', retryCount: sub.retryCount + 1 });

      F.expectError(await F.post(`${submissions}/${sub1.id}/retry`, {}, sv1), 409, { message: M.retryNotAllowed });
    });
  });

  describe('Result, history and compare (GET /:id/result, /history, /class-rank, /pitch-chart; GET /submissions, /piece-options, /compare)', () => {
    it('ITC-PR-010 the result cards of a finished submission', async () => {
      await completed({ accuracy: 70, createdAt: new Date('2026-11-02T02:00:00Z') });
      const sub1 = await completed({ createdAt: new Date('2026-11-05T02:00:00Z') });
      for (const accuracy of [60, 70, 90]) {
        const peer = await TestDatabase.createUser();
        await TestDatabase.addMember(classId, peer.id, gvA.id);
        await F.createSubmission({ studentId: peer.id, pieceId: p1, sheetMusicId: s1, assignmentId: as1, accuracy });
      }

      const result = await F.get(`${submissions}/${sub1.id}/result`, sv1);
      expect(result.status).toBe(200);
      expect(result.body.data.issues).toHaveLength(2);
      expect(result.body.data.aiFeedback.text).toBe('Giữ nhịp tốt.');
      expect(result.body.data.scores.overall).toBe(83);

      const history = await F.get(`${submissions}/${sub1.id}/history`, sv1);
      expect(history.status).toBe(200);
      expect(history.body.data).toMatchObject({ isFirstAttempt: false, deltaPercent: 12.5 });
      expect(history.body.data.bestPercent).toEqual(expect.any(Number));
      const submittedTimes = history.body.data.attempts.map((attempt: { submittedAt: string }) => attempt.submittedAt);
      expect(submittedTimes).toEqual(['2026-11-02T02:00:00.000Z', '2026-11-05T02:00:00.000Z']);

      const rank = await F.get(`${submissions}/${sub1.id}/class-rank`, sv1);
      expect(rank.status).toBe(200);
      expect(rank.body.data).toMatchObject({ className: 'Lớp C1', hasEnoughPeers: true, peerCount: 3, betterThanPercent: 67 });

      const chart = await F.get(`${submissions}/${sub1.id}/pitch-chart`, sv1);
      expect([200, 422]).toContain(chart.status);
      if (chart.status === 422) expect(chart.body.message).toBe(M.pitchUnavailable);
    });

    it("ITC-PR-011 a processing submission / someone else's submission", async () => {
      const sub1 = await completed();
      const sub = await processing();
      const running = await F.get(`${submissions}/${sub.id}/result`, sv1);
      expect(running.status).toBe(200);
      expect(running.body.message).toBe(M.processing);
      expect(running.body.data).toMatchObject({ submission: { status: 'PROCESSING' }, scores: null, aiFeedback: null, issues: [] });
      F.expectError(await F.get(`${submissions}/${sub1.id}/result`, sv2), 404, { message: M.submissionNotFound });
      F.expectError(await F.get(`${submissions}/${sub1.id}`, sv2), 404, { message: M.submissionNotFound });
    });

    it('ITC-PR-012 the history filters and range checks', async () => {
      const songs = [p1, (await secondSheet()).pieceId, (await F.createSong(tranhId, 'Bài 3')).id];
      for (let index = 0; index < 25; index += 1) {
        const pieceId = index === 24 ? songs[2] : songs[index % 2];
        await F.createSubmission({ studentId: sv1.id, pieceId, accuracy: index % 4 < 2 ? 75 : 95 });
      }

      const options = await F.get(`${submissions}/piece-options`, sv1);
      expect(options.status).toBe(200);
      expect(options.body.data).toHaveLength(3);

      const filtered = await F.get(`${submissions}?pieceIds=${songs[0]},${songs[1]}&accuracyRanges=ABOVE_90,70_90&page=2`, sv1);
      expect(filtered.status).toBe(200);
      expect(filtered.body.data.pagination).toEqual({ page: 2, limit: 20, total: 24 });
      expect(filtered.body.data.items).toHaveLength(4);

      const dates = await F.get(`${submissions}?fromDate=2026-11-07&toDate=2026-11-01`, sv1);
      F.expectValidationError(dates, 'toDate');
      expect(dates.body.errors[0].message).toBe('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');

      const accuracy = await F.get(`${submissions}?minAccuracy=80&maxAccuracy=70`, sv1);
      F.expectValidationError(accuracy, 'maxAccuracy');
      expect(accuracy.body.errors[0].message).toBe('Accuracy "Từ" phải nhỏ hơn hoặc bằng accuracy "Đến".');
    });

    it('ITC-PR-013 comparing two submissions of the same sheet', async () => {
      const pitchErrors = (...starts: number[]) => F.analysisResult({
        rhythmSegments: [], pitchErrorSegments: starts.map((startTime) => ({ startTime, endTime: startTime + 1, averageCentsDifference: 25 }))
      });
      const sub1 = await completed({ createdAt: new Date('2026-11-02T02:00:00Z'), result: pitchErrors(2, 6), pitchChart: F.pitchChart() } as object);
      const sub2 = await completed({ createdAt: new Date('2026-11-05T02:00:00Z'), result: pitchErrors(2, 10), pitchChart: F.pitchChart() } as object);
      const sub3 = await F.createSubmission({ studentId: sv1.id, ...(await secondSheet()) });
      const compare = (a: string, b: string) => F.get(`${submissions}/compare?a=${a}&b=${b}`, sv1);

      const compared = await compare(sub2.id, sub1.id);
      expect(compared.status).toBe(200);
      expect(compared.body.data.older.submissionId).toBe(sub1.id);
      expect(compared.body.data.newer.submissionId).toBe(sub2.id);
      expect(compared.body.data.segments.map((segment: { status: string }) => segment.status)).toEqual(['REPEATED', 'IMPROVED', 'NEW']);
      expect(compared.body.data.chart.points).toHaveLength(2);

      const same = await compare(sub1.id, sub1.id);
      F.expectValidationError(same, 'b');
      expect(same.body.errors[0].message).toBe('Vui lòng chọn 2 bài nộp khác nhau để so sánh.');

      F.expectError(await compare(sub1.id, sub3.id), 400, { message: 'Chỉ so sánh được hai bài nộp của cùng một bản nhạc.' });
    });
  });

  describe('Practise one part again (POST, GET /practice/submissions/:id/segments; GET /practice/segments/:segmentId, /pitch-chart; POST /internal/practice-segments/progress)', () => {
    it('ITC-PR-014 creating a segment attempt and receiving its result by callback', async () => {
      const sub1 = await completed();
      const created = await F.post(`${submissions}/${sub1.id}/segments`, segmentBody(), sv1);
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe('PROCESSING');
      const job = publish.mock.calls[0][0];
      expect(job).toMatchObject({ templateStartSec: 2, templateEndSec: 6.5, baselineEvaluationId: sub1.evaluationId });

      const callback = await F.callback('practice-segments', doneCallback(job.evaluationId, {
        overallScore: 88.4, pitchAccuracyPercent: 90, rhythmAccuracyPercent: 86, aiFeedback: 'Đoạn này đã ổn hơn.', baseline: { overallScore: 71 }
      }));
      expect(callback.status).toBe(200);

      const segment = await F.get(`/practice/segments/${created.body.data.id}`, sv1);
      expect(segment.status).toBe(200);
      expect(segment.body.data.scores.overall).toBe(88);
      expect(segment.body.data.comparison.original.overall).toBe(71);

      const older = await F.createSegment(sub1, { createdAt: new Date(Date.now() - 60_000) });
      const list = await F.get(`${submissions}/${sub1.id}/segments?limit=10`, sv1);
      expect(list.status).toBe(200);
      expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual([created.body.data.id, older.id]);
      expect(list.body.data).toHaveProperty('nextCursor', null);
    });

    it('ITC-PR-015 an invalid range and an unfinished original submission', async () => {
      const sub1 = await completed();
      const sub = await processing();
      const practise = (id: string, body: object) => F.post(`${submissions}/${id}/segments`, segmentBody(body), sv1);

      const emptyRange = await practise(sub1.id, { startSec: 5, endSec: 5 });
      F.expectBodyError(emptyRange, M.segmentInvalid);

      F.expectError(await practise(sub1.id, { startSec: 25, endSec: 30.01 }), 400, { message: M.segmentInvalid });
      F.expectError(await practise(sub.id, { startSec: 2, endSec: 4 }), 409, { message: 'Bài nộp chưa có kết quả phân tích hợp lệ để luyện lại.' });
      F.expectError(await F.get(`/practice/segments/${F.unknownId}`, sv1), 404, { message: M.segmentNotFound });
    });
  });

  describe('More read cases (GET /practice/submissions/:id, GET /practice/segments/:segmentId/pitch-chart)', () => {
    it("ITC-PR-016 a student reads the status of one submission, but not another student's", async () => {
      const sub1 = await completed();
      const response = await F.get(`${submissions}/${sub1.id}`, sv1);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ status: 'COMPLETED', stage: 'FEEDBACK', accuracy: 82.5 });

      F.expectError(await F.get(`${submissions}/${sub1.id}`, sv2), 404, { message: M.submissionNotFound });
      F.expectError(await F.get(`${submissions}/${randomUUID()}`, sv1), 404, { message: M.submissionNotFound });
    });

    it('ITC-PR-017 the pitch chart of a part practice, and a part practice of another student', async () => {
      const sub1 = await completed();
      const segment = await F.createSegment(sub1, { result: F.analysisResult({ pitch: F.segmentPitch() }) });
      const segmentNoPitch = await F.createSegment(sub1, { result: F.analysisResult() });

      const chart = await F.get(`/practice/segments/${segment.id}/pitch-chart`, sv1);
      expect(chart.status).toBe(200);
      expect(chart.body.data.points).toEqual([[0, 440, 439], [0.01, 442, 441], [0.02, 444, 445]]);

      F.expectError(await F.get(`/practice/segments/${segment.id}`, sv2), 404, { message: M.segmentNotFound });
      F.expectError(await F.get(`/practice/segments/${segmentNoPitch.id}/pitch-chart`, sv1), 422, { message: M.pitchUnavailable });
    });
  });

  describe('More submit and retry checks (POST /practice/submissions, GET /submissions/active, POST /:id/retry)', () => {
    it('ITC-PR-018 the submit body is validated', async () => {
      const valid = { sheetMusicId: s1, studentUploadId: up1.id };
      F.expectError(await submit({ studentUploadId: up1.id }, sv1), 400, { message: M.invalidData, field: 'sheetMusicId' });
      F.expectError(await submit({ ...valid, studentUploadId: 'abc' }, sv1), 400, { message: M.invalidData, field: 'studentUploadId' });
      F.expectError(await submit({ ...valid, practiceMode: 'DUET' }, sv1), 400, { message: M.invalidData, field: 'practiceMode' });
      F.expectBodyError(await submit({ ...valid, score: 100 }, sv1), 'score');
    });

    it('ITC-PR-019 submitting for a sheet that does not exist', async () => {
      const uploaded = await request(F.app).post(`${F.api}/audio-uploads`).set('Authorization', TestDatabase.tokenFor(sv1))
        .attach('file', SampleMediaFactory.createWav(2), 'ban-thu.wav');
      expect(uploaded.status).toBe(201);
      F.expectError(await submit({ sheetMusicId: 'no-such-sheet', studentUploadId: uploaded.body.data.fileId }, sv1), 404, { message: M.sheetNotFound });
    });

    it('ITC-PR-020 a Guest cannot submit or read submissions', async () => {
      const submission = await completed();
      F.expectUnauthorized(await submit({ sheetMusicId: s1, studentUploadId: up1.id }));
      F.expectUnauthorized(await F.get(`${submissions}/${submission.id}`));
    });

    it('ITC-PR-021 the active submission of a sheet', async () => {
      await submit({ sheetMusicId: s1, studentUploadId: up1.id }, sv1);
      const stored = await TestDatabase.prisma.submission.findFirstOrThrow({ where: { studentId: sv1.id } });

      const active = await F.get(`${submissions}/active?sheetMusicId=${s1}`, sv1);
      expect(active.status).toBe(200);
      expect(active.body.data).toMatchObject({ id: stored.id, status: 'PROCESSING' });

      F.expectError(await F.get(`${submissions}/active`, sv1), 400, { field: 'sheetMusicId' });
    });

    it('ITC-PR-022 a finished submission cannot be retried', async () => {
      const submission = await completed();
      F.expectError(await F.post(`${submissions}/${submission.id}/retry`, {}, sv1), 409, { message: M.retryNotAllowed });
    });

    it('ITC-PR-023 retrying too early and an unknown submission', async () => {
      const submission = await processing();
      await F.callback('practice-submissions', { evaluationId: submission.evaluationId, attempt: 1, job: 'comparison', status: 'failed' });
      F.expectError(await F.post(`${submissions}/${submission.id}/retry`, {}, sv1), 409, { message: M.retryTooEarly });
      F.expectError(await F.post(`${submissions}/${randomUUID()}/retry`, {}, sv1), 404, { message: M.submissionNotFound });
    });
  });

  describe('More result checks (GET /:id/pitch-chart, /compare, /submissions, /piece-options, /sheets/:id/tunes)', () => {
    it('ITC-PR-024 the pitch chart when there is no pitch data', async () => {
      const submission = await completed();
      F.expectError(await F.get(`${submissions}/${submission.id}/pitch-chart`, sv1), 422, { message: M.pitchUnavailable });
    });

    it('ITC-PR-025 the compare errors', async () => {
      const first = await completed();
      const otherSheet = await F.createSubmission({ studentId: sv1.id, ...(await secondSheet()) });
      const running = await processing();
      const compare = (a: string, b: string) => F.get(`${submissions}/compare?a=${a}&b=${b}`, sv1);

      const same = await compare(first.id, first.id);
      F.expectValidationError(same, 'b');
      expect(same.body.errors[0].message).toBe('Vui lòng chọn 2 bài nộp khác nhau để so sánh.');
      F.expectError(await compare(first.id, otherSheet.id), 400, { message: 'Chỉ so sánh được hai bài nộp của cùng một bản nhạc.' });
      F.expectError(await compare(first.id, running.id), 409, { message: M.processing });
      F.expectError(await compare('abc', first.id), 400, { field: 'a' });
    });

    it('ITC-PR-026 the history filters by kind, song and title', async () => {
      const p2 = (await secondSheet()).pieceId;
      const p3 = (await F.createSong(tranhId, 'Bèo dạt mây trôi')).id;
      const solo = await F.createSubmission({ studentId: sv1.id, pieceId: p1 });
      const ensemble = await F.createSubmission({ studentId: sv1.id, pieceId: p2, practiceMode: 'ENSEMBLE' });
      const other = await F.createSubmission({ studentId: sv1.id, pieceId: p3 });
      const list = async (query: string) => {
        const response = await F.get(`${submissions}?${query}`, sv1);
        expect(response.status).toBe(200);
        return response.body.data.items.map((item: { id: string }) => item.id).sort();
      };

      expect(await list('kinds=ENSEMBLE')).toEqual([ensemble.id]);
      expect(await list(`pieceIds=${p1},${p2}`)).toEqual([solo.id, ensemble.id].sort());
      expect(await list(`title=${encodeURIComponent('mây trôi')}`)).toEqual([other.id]);
      expect((await F.get(`${submissions}?kinds=DUET`, sv1)).status).toBe(400);
    });

    it('ITC-PR-027 the song list for the history filter', async () => {
      const p2 = (await secondSheet()).pieceId;
      await F.createSong(tranhId, 'Bài chưa nộp');
      for (const pieceId of [p1, p1, p2]) await F.createSubmission({ studentId: sv1.id, pieceId });

      const response = await F.get(`${submissions}/piece-options`, sv1);
      expect(response.status).toBe(200);
      expect(response.body.data.map((item: { id: string }) => item.id).sort()).toEqual([p1, p2].sort());
    });

    it('ITC-PR-028 the string tunes of an unknown sheet', async () => {
      F.expectError(await F.get('/practice/sheets/no-such-sheet/tunes', sv1), 404, { message: M.sheetNotFound });
    });
  });

  describe('More part practice checks (POST, GET /:id/segments; GET /practice/segments/:segmentId)', () => {
    it("ITC-PR-029 a part practice with another student's recording", async () => {
      const submission = await completed();
      const foreignUpload = await F.createUpload(sv2.id);
      F.expectError(
        await F.post(`${submissions}/${submission.id}/segments`, { startSec: 2, endSec: 6, studentUploadId: foreignUpload.id }, sv1),
        404, { message: M.uploadInvalid }
      );
    });

    it('ITC-PR-030 an unknown part practice and one that is still processing', async () => {
      const submission = await completed();
      F.expectError(await F.get(`/practice/segments/${randomUUID()}`, sv1), 404, { message: M.segmentNotFound });
      const created = await F.post(`${submissions}/${submission.id}/segments`, segmentBody(), sv1);
      F.expectError(await F.get(`/practice/segments/${created.body.data.id}/pitch-chart`, sv1), 409, { message: M.processing });
    });

    it('ITC-PR-031 the part practice list paging', async () => {
      const submission = await completed();
      const segments: Array<{ id: string }> = [];
      for (let minute = 1; minute <= 3; minute += 1) segments.push(await F.createSegment(submission, { createdAt: new Date(Date.now() - minute * 60_000) }));
      const list = (query: string) => F.get(`${submissions}/${submission.id}/segments?${query}`, sv1);
      const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

      const firstPage = await list('limit=2');
      expect(firstPage.status).toBe(200);
      expect(ids(firstPage.body.data.items)).toEqual([segments[0].id, segments[1].id]);
      expect(firstPage.body.data.nextCursor).toBe(segments[1].id);

      const secondPage = await list(`limit=2&cursor=${firstPage.body.data.nextCursor}`);
      expect(ids(secondPage.body.data.items)).toEqual([segments[2].id]);

      F.expectError(await list('cursor=abc'), 400, { field: 'cursor' });
    });

    // Rhythm's rejection of the silent recording arrives as its "rejected" callback
    it('ITC-PR-032 a failed part practice does not change the first result', async () => {
      const submission = await completed();
      const before = await F.get(`${submissions}/${submission.id}/result`, sv1);
      const created = await F.post(`${submissions}/${submission.id}/segments`, segmentBody(), sv1);
      await F.callback('practice-segments', {
        evaluationId: publish.mock.calls[0][0].evaluationId, attempt: 1, job: 'quality_check', status: 'rejected', code: 'SILENT', reason: 'Bản thu không có âm thanh.'
      });

      const segment = await F.get(`/practice/segments/${created.body.data.id}`, sv1);
      expect(segment.status).toBe(200);
      expect(['REJECTED', 'FAILED']).toContain(segment.body.data.status);
      expect(segment.body.data.error.message).toBe('Bản thu không có âm thanh.');

      const after = await F.get(`${submissions}/${submission.id}/result`, sv1);
      expect(after.body.data.scores).toEqual(before.body.data.scores);
    });

    it('ITC-PR-033 lecturers cannot use the student practice APIs', async () => {
      const submission = await completed();
      F.expectForbiddenRole(await F.get(submissions, gvA));
      F.expectForbiddenRole(await F.post(`${submissions}/${submission.id}/segments`, segmentBody(), gvA));
      F.expectForbiddenRole(await F.get(`/practice/target-bpm?sheetMusicId=${s1}`, gvA));
    });

    it('ITC-PR-034 the part callback rules', async () => {
      const segment = await F.createSegment(await completed(), { status: 'PROCESSING', stage: 'COMPARISON' });

      const missing = await F.callback('practice-segments', doneCallback(segment.evaluationId));
      F.expectBodyError(missing, 'Thiếu kết quả phân tích.');

      const done = await F.callback('practice-segments', doneCallback(segment.evaluationId, {
        overallScore: null, pitchAccuracyPercent: null, rhythmAccuracyPercent: null, aiFeedback: ''
      }));
      expect(done.status).toBe(200);
      const stored = await F.get(`/practice/segments/${segment.id}`, sv1);
      expect(stored.body.data).toMatchObject({ status: 'COMPLETED', scores: { overall: null, pitch: null, rhythm: null } });
    });
  });
});
