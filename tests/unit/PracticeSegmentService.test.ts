/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/PracticeSegmentService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import PracticeSegmentServiceClass from '../../src/modules/practice/service/PracticeSegmentService.ts';
import SegmentProgressServiceClass from '../../src/modules/practice/service/SegmentProgressService.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { E, R, expectAppError, method, sheet, tc } = UnitTestKit;
  const PracticeSegmentService: any = PracticeSegmentServiceClass;
  const SegmentProgressService: any = SegmentProgressServiceClass;

  const M = {
    NOT_FOUND: 'Không tìm thấy bản nộp.', NOT_READY: 'Bài nộp chưa có kết quả phân tích hợp lệ để luyện lại.', INVALID: 'Đoạn luyện tập không hợp lệ.',
    UPLOAD: 'File ghi âm không hợp lệ hoặc bạn không có quyền sử dụng file.', SEGMENT_NOT_FOUND: 'Không tìm thấy lượt luyện đoạn.',
    PROCESSING: 'Bản thu đang được xử lý. Kết quả sẽ hiển thị khi phân tích hoàn tất.', PITCH: 'Chưa có dữ liệu cao độ để hiển thị biểu đồ so sánh.',
    FAILED: 'Phân tích đoạn luyện tập thất bại. Kết quả cũ vẫn được giữ nguyên.', REJECTED: 'Bản thu không đạt chất lượng.'
  };
  const now = new Date('2026-11-07T03:00:00Z');
  const sheetTemplate = { id: 's1', pieceId: 'p1', instrumentId: 'i-bau', kind: 'MAIN', analysisStatus: 'READY', referenceAudio: { storageKey: 'audio/t.wav', status: 'READY' }, instrument: { code: 'dan_bau' } };
  const origin = (overrides: Record<string, unknown> = {}) => ({ id: 'sub-1', studentId: 'SV-1', status: 'COMPLETED', evaluationId: 'ev-original', result: {}, pitchChart: { durationSec: 30 }, sheetMusic: sheetTemplate, ...overrides });
  const segment = (overrides: Record<string, unknown> = {}) => ({
    id: 'seg-1', submissionId: 'sub-1', studentId: 'SV-1', startSec: 2, endSec: 6.5, studentUploadId: 'up-1', fileUrl: 'http://localhost:3000/uploads/u.wav',
    status: 'PROCESSING', stage: 'QUALITY_CHECK', evaluationId: 'ev-seg', messageId: 'msg-1', publicationState: 'published', attempt: 1, result: null, aiFeedback: null,
    accuracy: null, pitchAccuracy: null, rhythmAccuracy: null, baselineAccuracy: null, baselinePitch: null, baselineRhythm: null,
    rejectReason: null, errorCode: null, errorMessage: null, analyzedAt: null, createdAt: now, updatedAt: now, ...overrides
  });
  const segmentSetup = (options: { original?: unknown; upload?: unknown; publishState?: string; owned?: unknown; rows?: unknown[]; previous?: unknown } = {}) => {
    const jobs: any[] = []; const calls: any[] = []; let stored: any = null;
    const repository = {
      findOriginal: async (_id: string, studentId: string) => { const found: any = options.original !== undefined ? options.original : origin(); return found && found.studentId === studentId ? found : null; },
      create: async (data: any) => { stored = segment({ ...data, id: 'seg-1' }); calls.push(['create', data]); return stored; },
      findById: async () => stored ?? options.owned ?? null,
      findOwned: async () => options.owned ?? null,
      findPreviousSameRange: async () => options.previous ?? null,
      updatePublication: async (_id: string, data: any) => { calls.push(['updatePublication', data]); stored = { ...stored, ...data }; },
      updateIfCurrent: async (_id: string, _expected: unknown, data: any) => { calls.push(['updateIfCurrent', data]); stored = { ...stored, ...data }; return true; },
      listBySubmission: async (_s: string, _st: string, page: any) => { calls.push(['list', page]); return options.rows ?? []; }
    };
    const uploads = { findOwnedUpload: async () => (options.upload !== undefined ? options.upload : { id: 'up-1', url: 'http://localhost:3000/uploads/u.wav' }) };
    const publisher = { publish: async (job: any) => { jobs.push(job); return options.publishState ?? 'published'; } };
    const jobBuilder = { build: async (_sheet: any, ids: any, fileUrl: string, callbackPath: string) => ({ evaluationId: ids.evaluationId, messageId: ids.messageId, attempt: ids.attempt, studentAudioUrl: fileUrl, callbackPath }) };
    const progress = { reconcile: async (record: any) => record };
    return { service: new PracticeSegmentService({ repository, uploads, publisher, jobBuilder, progress, now: () => now }), jobs, calls };
  };
  const input = { startSec: 2, endSec: 6.5, studentUploadId: 'up-1' };
  const progressSetup = (stored: any, options: { remote?: any; remoteError?: boolean } = {}) => {
    const updates: any[] = [];
    const repository = { findByEvaluationId: async () => stored, findById: async () => stored, updateIfCurrent: async (_id: string, expected: any, data: any) => { updates.push({ expected, data }); return true; } };
    const client = { get: async () => { if (options.remoteError) throw new Error('Rhythm down'); return options.remote; } };
    return { service: new SegmentProgressService(repository, client, () => now), updates };
  };
  const segmentResult = { overallScore: 88.4, pitchAccuracyPercent: 90, rhythmAccuracyPercent: 86, aiFeedback: 'Đoạn này đã ổn hơn.', baseline: { overallScore: 71, pitchAccuracyPercent: 70, rhythmAccuracyPercent: 72 } };

  sheet('PracticeSegmentService', 'PG', 'src/modules/practice/service/PracticeSegmentServiceReport.test.ts');
  method('create(studentId, submissionId, input)');
  tc('fake repository: sub-1 of SV-1 COMPLETED (evaluationId ev-original, chart 30 s); upload up-1 of SV-1; publisher → "published"', 'studentId="SV-1"; submissionId="sub-1"; input={ startSec: 2, endSec: 6.5, studentUploadId: "up-1" }',
    R('{ id: "seg-1", submissionId: "sub-1", startSec: 2, endSec: 6.5, status: "PROCESSING", scores: null }', 'publisher.publish(job { templateStartSec: 2, templateEndSec: 6.5, baselineEvaluationId: "ev-original", callbackPath: "/api/v1/internal/practice-segments/progress" }); updatePublication { publicationState: "published" }'), 'Normal', async () => {
      const { service, jobs, calls } = segmentSetup(); const dto = await service.create('SV-1', 'sub-1', input);
      assert.deepEqual([dto.id, dto.status, dto.startSec, dto.endSec, dto.scores], ['seg-1', 'PROCESSING', 2, 6.5, null]);
      assert.deepEqual([jobs[0].templateStartSec, jobs[0].templateEndSec, jobs[0].baselineEvaluationId, jobs[0].callbackPath], [2, 6.5, 'ev-original', '/api/v1/internal/practice-segments/progress']);
      assert.deepEqual(calls.find((call) => call[0] === 'updatePublication')[1], { publicationState: 'published' });
    });
  tc('publisher → "publish_failed"', 'input={ startSec: 2, endSec: 6.5, studentUploadId: "up-1" }', R('{ status: "FAILED", error: { code: "PUBLISH_FAILED", message: "Phân tích đoạn luyện tập thất bại. Kết quả cũ vẫn được giữ nguyên." } } (original result kept)'), 'Abnormal', async () => {
    const dto = await segmentSetup({ publishState: 'publish_failed' }).service.create('SV-1', 'sub-1', input); assert.deepEqual([dto.status, dto.error], ['FAILED', { code: 'PUBLISH_FAILED', message: M.FAILED }]);
  });
  tc('publisher → "publish_unknown"', 'input={ startSec: 2, endSec: 6.5, studentUploadId: "up-1" }', R('{ status: "PROCESSING" }', 'updatePublication { publicationState: "publish_unknown" } (worker may still receive it)'), 'Boundary', async () => {
    const { service, calls } = segmentSetup({ publishState: 'publish_unknown' }); assert.equal((await service.create('SV-1', 'sub-1', input)).status, 'PROCESSING'); assert.deepEqual(calls.find((call) => call[0] === 'updatePublication')[1], { publicationState: 'publish_unknown' });
  });
  tc('sub-1 belongs to SV-2', 'studentId="SV-1"; submissionId="sub-1"', E(404, null, M.NOT_FOUND), 'Abnormal', () => expectAppError(() => segmentSetup({ original: origin({ studentId: 'SV-2' }) }).service.create('SV-1', 'sub-1', input), 404, null, M.NOT_FOUND));
  tc('sub-1 still PROCESSING', 'submissionId="sub-1"', E(409, null, M.NOT_READY), 'Abnormal', () => expectAppError(() => segmentSetup({ original: origin({ status: 'PROCESSING' }) }).service.create('SV-1', 'sub-1', input), 409, null, M.NOT_READY));
  tc('sub-1 COMPLETED without evaluationId', 'submissionId="sub-1"', E(409, null, M.NOT_READY), 'Abnormal', () => expectAppError(() => segmentSetup({ original: origin({ evaluationId: null }) }).service.create('SV-1', 'sub-1', input), 409, null, M.NOT_READY));
  tc('chart duration 30 s', 'input={ startSec: 6.5, endSec: 2 } (end before start)', E(400, null, M.INVALID), 'Abnormal', () => expectAppError(() => segmentSetup().service.create('SV-1', 'sub-1', { ...input, startSec: 6.5, endSec: 2 }), 400, null, M.INVALID));
  tc('chart duration 30 s', 'input={ startSec: -1, endSec: 3 }', E(400, null, M.INVALID), 'Boundary', () => expectAppError(() => segmentSetup().service.create('SV-1', 'sub-1', { ...input, startSec: -1, endSec: 3 }), 400, null, M.INVALID));
  tc('chart duration 30 s', 'input={ startSec: 25, endSec: 30.01 } (past the end)', E(400, null, M.INVALID), 'Boundary', () => expectAppError(() => segmentSetup().service.create('SV-1', 'sub-1', { ...input, startSec: 25, endSec: 30.01 }), 400, null, M.INVALID));
  tc('chart duration 30 s', 'input={ startSec: 25, endSec: 30 } (exactly the end)', R('{ status: "PROCESSING" }'), 'Boundary', async () => assert.equal((await segmentSetup().service.create('SV-1', 'sub-1', { ...input, startSec: 25, endSec: 30 })).status, 'PROCESSING'));
  tc('no chart; result.studentAudioQuality.audio.durationSec = 12', 'input={ startSec: 10, endSec: 13 }', E(400, null, M.INVALID, undefined, 'duration read from the recording quality data'), 'Boundary', () => expectAppError(() => segmentSetup({ original: origin({ pitchChart: null, result: { studentAudioQuality: { audio: { durationSec: 12 } } } }) }).service.create('SV-1', 'sub-1', { ...input, startSec: 10, endSec: 13 }), 400, null, M.INVALID));
  tc('no chart and no recorded duration', 'input={ startSec: 100, endSec: 120 }', R('{ status: "PROCESSING" } (only the order is checked when length is unknown)'), 'Boundary', async () => assert.equal((await segmentSetup({ original: origin({ pitchChart: null }) }).service.create('SV-1', 'sub-1', { ...input, startSec: 100, endSec: 120 })).status, 'PROCESSING'));
  tc('findOwnedUpload → null (upload of another account)', 'input.studentUploadId="up-x"', E(404, null, M.UPLOAD), 'Abnormal', () => expectAppError(() => segmentSetup({ upload: null }).service.create('SV-1', 'sub-1', { ...input, studentUploadId: 'up-x' }), 404, null, M.UPLOAD));
  method('get(studentId, segmentId)');
  tc('seg-1 COMPLETED { accuracy 88.4, pitch 90, rhythm 86, baseline 71 / 70 / 72 }; previous same-range attempt seg-0 { accuracy 80 }', 'studentId="SV-1"; segmentId="seg-1"', R('{ scores: { overall: 88, pitch: 90, rhythm: 86 }, comparison: { original: { overall: 71, pitch: 70, rhythm: 72 }, previous: { overall: 80, attemptId: "seg-0" } } }'), 'Normal', async () => {
    const owned = segment({ status: 'COMPLETED', accuracy: 88.4, pitchAccuracy: 90, rhythmAccuracy: 86, baselineAccuracy: 71, baselinePitch: 70, baselineRhythm: 72, aiFeedback: 'Đoạn này đã ổn hơn.', analyzedAt: now, result: {} });
    const dto = await segmentSetup({ owned, previous: segment({ id: 'seg-0', status: 'COMPLETED', accuracy: 80, pitchAccuracy: 82, rhythmAccuracy: 78 }) }).service.get('SV-1', 'seg-1');
    assert.deepEqual([dto.scores, dto.comparison.original, dto.comparison.previous.overall, dto.comparison.previous.attemptId], [{ overall: 88, pitch: 90, rhythm: 86 }, { overall: 71, pitch: 70, rhythm: 72 }, 80, 'seg-0']);
  });
  tc('seg-1 PROCESSING', 'segmentId="seg-1"', R('{ status: "PROCESSING", scores: null, comparison: { previous: null } }'), 'Normal', async () => { const dto = await segmentSetup({ owned: segment() }).service.get('SV-1', 'seg-1'); assert.deepEqual([dto.status, dto.scores, dto.comparison.previous], ['PROCESSING', null, null]); });
  tc('findOwned → null', 'segmentId="seg-x"', E(404, null, M.SEGMENT_NOT_FOUND), 'Abnormal', () => expectAppError(() => segmentSetup().service.get('SV-1', 'seg-x'), 404, null, M.SEGMENT_NOT_FOUND));
  method('getPitchChart(studentId, segmentId)');
  tc('seg-1 { startSec 2, COMPLETED, result.pitch: { sampleRate 2, hop 1, teacher [220, 330], student [221, 333], studentFrameByTeacherFrame [0, 1] } }', 'segmentId="seg-1"', R('{ points: [[0, 220, 221], [0.5, 330, 333]], durationSec: 1 } (only the practised range)'), 'Normal', async () => {
    const owned = segment({ status: 'COMPLETED', result: { pitch: { sampleRate: 2, hopLength: 1, teacherF0Hz: [220, 330], studentF0Hz: [221, 333], studentFrameByTeacherFrame: [0, 1] } } });
    const chart = await segmentSetup({ owned }).service.getPitchChart('SV-1', 'seg-1'); assert.deepEqual([chart.points, chart.durationSec], [[[0, 220, 221], [0.5, 330, 333]], 1]);
  });
  tc('seg-1 PROCESSING', 'segmentId="seg-1"', E(409, null, M.PROCESSING), 'Abnormal', () => expectAppError(() => segmentSetup({ owned: segment() }).service.getPitchChart('SV-1', 'seg-1'), 409, null, M.PROCESSING));
  tc('seg-1 COMPLETED with result { } (no pitch data)', 'segmentId="seg-1"', E(422, null, M.PITCH), 'Abnormal', () => expectAppError(() => segmentSetup({ owned: segment({ status: 'COMPLETED', result: {} }) }).service.getPitchChart('SV-1', 'seg-1'), 422, null, M.PITCH));
  tc('findOwned → null', 'segmentId="seg-x"', E(404, null, M.SEGMENT_NOT_FOUND), 'Abnormal', () => expectAppError(() => segmentSetup().service.getPitchChart('SV-1', 'seg-x'), 404, null, M.SEGMENT_NOT_FOUND));
  method('list(studentId, submissionId, page)');
  tc('listBySubmission returns 3 rows (seg-3, seg-2, seg-1)', 'page={ limit: 2 }', R('{ items: [seg-3, seg-2], nextCursor: "seg-2" }', 'listBySubmission(…, { limit: 3 }) (one extra row to detect the next page)'), 'Normal', async () => {
    const { service, calls } = segmentSetup({ rows: [segment({ id: 'seg-3' }), segment({ id: 'seg-2' }), segment({ id: 'seg-1' })] }); const pageDto = await service.list('SV-1', 'sub-1', { limit: 2 });
    assert.deepEqual([pageDto.items.map((item: any) => item.id), pageDto.nextCursor, calls.find((call) => call[0] === 'list')[1].limit], [['seg-3', 'seg-2'], 'seg-2', 3]);
  });
  tc('listBySubmission returns 2 rows', 'page={ limit: 2 }', R('{ items: [2 rows], nextCursor: null }'), 'Boundary', async () => assert.equal((await segmentSetup({ rows: [segment({ id: 'seg-2' }), segment()] }).service.list('SV-1', 'sub-1', { limit: 2 })).nextCursor, null));
  tc('findOriginal → null', 'submissionId="sub-x"', E(404, null, M.NOT_FOUND), 'Abnormal', () => expectAppError(() => segmentSetup({ original: null }).service.list('SV-1', 'sub-x', { limit: 10 }), 404, null, M.NOT_FOUND));
  method('SegmentProgressService.apply(callback)');
  tc('stored seg-1 { attempt 1, PROCESSING, stage QUALITY_CHECK }', 'callback={ evaluationId: "ev-seg", attempt: 1, job: "comparison", status: "started" }', R('true', 'updateIfCurrent { stage: "COMPARISON", stageStartedAt: now }'), 'Normal', async () => {
    const { service, updates } = progressSetup(segment()); assert.equal(await service.apply({ evaluationId: 'ev-seg', attempt: 1, job: 'comparison', status: 'started' }), true); assert.deepEqual(updates[0].data, { stage: 'COMPARISON', stageStartedAt: now });
  });
  tc('stored seg-1 at COMPARISON', 'callback={ job: "quality_check", status: "started" }', R('false (stage never moves back)'), 'Abnormal', async () => assert.equal(await progressSetup(segment({ stage: 'COMPARISON' })).service.apply({ evaluationId: 'ev-seg', attempt: 1, job: 'quality_check', status: 'started' }), false));
  tc('stored seg-1', 'callback={ job: "feedback", status: "done", result: { overallScore 88.4, pitch 90, rhythm 86, baseline { 71, 70, 72 }, aiFeedback } }', R('true', 'update { status: "COMPLETED", accuracy: 88.4, pitchAccuracy: 90, rhythmAccuracy: 86, baselineAccuracy: 71, baselinePitch: 70, baselineRhythm: 72, analyzedAt: now }'), 'Normal', async () => {
    const { service, updates } = progressSetup(segment()); await service.apply({ evaluationId: 'ev-seg', attempt: 1, job: 'feedback', status: 'done', result: segmentResult });
    const data = updates[0].data; assert.deepEqual([data.status, data.accuracy, data.pitchAccuracy, data.rhythmAccuracy, data.baselineAccuracy, data.baselinePitch, data.baselineRhythm, data.analyzedAt], ['COMPLETED', 88.4, 90, 86, 71, 70, 72, now]);
  });
  tc('stored seg-1', 'callback={ job: "feedback", status: "done", result without baseline }', R('true', 'baselineAccuracy / baselinePitch / baselineRhythm = null'), 'Boundary', async () => {
    const { service, updates } = progressSetup(segment()); await service.apply({ evaluationId: 'ev-seg', attempt: 1, job: 'feedback', status: 'done', result: { ...segmentResult, baseline: undefined } });
    assert.deepEqual([updates[0].data.baselineAccuracy, updates[0].data.baselinePitch, updates[0].data.baselineRhythm], [null, null, null]);
  });
  tc('stored seg-1', 'callback={ job: "quality_check", status: "rejected" } without reason / code', R('true', 'update { status: "REJECTED", rejectReason: "Bản thu không đạt chất lượng.", errorCode: "QUALITY_REJECTED" }'), 'Normal', async () => {
    const { service, updates } = progressSetup(segment()); await service.apply({ evaluationId: 'ev-seg', attempt: 1, job: 'quality_check', status: 'rejected' }); assert.deepEqual([updates[0].data.status, updates[0].data.rejectReason, updates[0].data.errorCode], ['REJECTED', M.REJECTED, 'QUALITY_REJECTED']);
  });
  tc('stored seg-1', 'callback={ job: "audio_analysis", status: "failed" }', R('true', 'update { status: "FAILED", errorCode: "EVALUATION_FAILED", errorMessage: "Phân tích đoạn luyện tập thất bại. Kết quả cũ vẫn được giữ nguyên." } (no retry window for segments)'), 'Normal', async () => {
    const { service, updates } = progressSetup(segment()); await service.apply({ evaluationId: 'ev-seg', attempt: 1, job: 'audio_analysis', status: 'failed' }); assert.deepEqual([updates[0].data.status, updates[0].data.errorCode, updates[0].data.errorMessage, 'retryAvailableAt' in updates[0].data], ['FAILED', 'EVALUATION_FAILED', M.FAILED, false]);
  });
  tc('stored seg-1 COMPLETED', 'callback={ status: "started" }', R('false'), 'Abnormal', async () => assert.equal(await progressSetup(segment({ status: 'COMPLETED' })).service.apply({ evaluationId: 'ev-seg', attempt: 1, job: 'comparison', status: 'started' }), false));
  tc('findByEvaluationId → null', 'callback={ evaluationId: "ev-x" }', R('false'), 'Abnormal', async () => assert.equal(await progressSetup(null).service.apply({ evaluationId: 'ev-x', attempt: 1, job: 'comparison', status: 'started' }), false));
  method('SegmentProgressService.reconcile(record)');
  tc('seg-1 PROCESSING (published); Rhythm → { status: "completed", result }', 'reconcile(seg-1)', R('re-read record', 'update status "COMPLETED" (lost callback replayed)'), 'Normal', async () => { const { service, updates } = progressSetup(segment(), { remote: { evaluationId: 'ev-seg', attempt: 1, status: 'completed', result: segmentResult } }); await service.reconcile(segment()); assert.equal(updates[0].data.status, 'COMPLETED'); });
  tc('seg-1 PROCESSING; Rhythm → { status: "failed", error: { code: "AUDIO_DECODE", message: "x" } }', 'reconcile(seg-1)', R('record', 'update { status: "FAILED", errorCode: "AUDIO_DECODE" }'), 'Normal', async () => { const { service, updates } = progressSetup(segment(), { remote: { evaluationId: 'ev-seg', attempt: 1, status: 'failed', error: { code: 'AUDIO_DECODE', message: 'x' } } }); await service.reconcile(segment()); assert.deepEqual([updates[0].data.status, updates[0].data.errorCode], ['FAILED', 'AUDIO_DECODE']); });
  tc('seg-1 PROCESSING { attempt 1 }; Rhythm → { attempt: 2 }', 'reconcile(seg-1)', R('record', 'no update (other attempt)'), 'Abnormal', async () => { const { service, updates } = progressSetup(segment(), { remote: { evaluationId: 'ev-seg', attempt: 2, status: 'completed', result: segmentResult } }); await service.reconcile(segment()); assert.equal(updates.length, 0); });
  tc('seg-1 PROCESSING; Rhythm client throws', 'reconcile(seg-1)', R('record (stays PROCESSING)', 'no update'), 'Abnormal', async () => { const { service, updates } = progressSetup(segment(), { remoteError: true }); assert.equal((await service.reconcile(segment())).status, 'PROCESSING'); assert.equal(updates.length, 0); });
  tc('seg-1 COMPLETED', 'reconcile(seg-1)', R('same record (Rhythm not asked)'), 'Boundary', async () => { const done = segment({ status: 'COMPLETED' }); assert.equal(await progressSetup(done).service.reconcile(done), done); });

}
