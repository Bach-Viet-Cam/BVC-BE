/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/SubmissionProgressService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import SubmissionProgressServiceClass from '../../src/modules/practice/service/SubmissionProgressService.ts';
import PracticeResultDTOClass from '../../src/modules/practice/dto/PracticeResultDTO.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { R, method, sheet, tc } = UnitTestKit;
  const SubmissionProgressService: any = SubmissionProgressServiceClass;
  const PracticeResultDTO: any = PracticeResultDTOClass;

  const now = new Date('2026-11-07T03:00:00Z');
  const record = (overrides: Record<string, unknown> = {}) => ({ id: 'sub-1', evaluationId: 'ev-1', attempt: 1, status: 'PROCESSING', stage: 'AUDIO_ANALYSIS', retryCount: 0, publicationState: 'published', fileDeletedAt: null, ...overrides });
  const result = { overallScore: 82.5, teacherTempoBpm: 90, studentTempoBpm: 99, aiFeedback: 'Giữ nhịp tốt.' };
  const setup = (stored: any, options: { remote?: any; remoteError?: boolean; claim?: boolean } = {}) => {
    const updates: any[] = []; const deletions: any[] = [];
    const repository = {
      findByEvaluationId: async () => stored, findById: async () => stored,
      updateIfCurrent: async (id: string, expected: any, data: any) => { updates.push({ id, expected, data }); return options.claim !== false; }
    };
    const files = { deleteStudentFile: async (target: any, at: Date) => { deletions.push([target.id, at]); } };
    const client = { get: async () => { if (options.remoteError) throw new Error('Rhythm down'); return options.remote; } };
    return { service: new SubmissionProgressService(repository, files, client, () => now), updates, deletions };
  };
  const callback = (overrides: Record<string, unknown> = {}) => ({ evaluationId: 'ev-1', attempt: 1, job: 'comparison', status: 'started', ...overrides });

  sheet('SubmissionProgressService', 'SP', 'src/modules/practice/service/SubmissionProgressServiceReport.test.ts');
  method('PracticeResultDTO.toTempoDeviation(teacherBpm, studentBpm)');
  tc('N/A', 'teacherBpm=90; studentBpm=99', R('10 (% faster)'), 'Normal', () => assert.equal(PracticeResultDTO.toTempoDeviation(90, 99), 10));
  tc('N/A', 'teacherBpm=90; studentBpm=45 (half tempo, counted per half note)', R('0 (octave-error correction: 2 × 45 / 90 = 1)'), 'Boundary', () => assert.equal(PracticeResultDTO.toTempoDeviation(90, 45), 0));
  tc('N/A', 'teacherBpm=0 / studentBpm="abc"', R('null'), 'Abnormal', () => assert.deepEqual([PracticeResultDTO.toTempoDeviation(0, 90), PracticeResultDTO.toTempoDeviation(90, 'abc')], [null, null]));
  method('apply(callback)');
  tc('stored sub-1 { attempt 1, PROCESSING, stage AUDIO_ANALYSIS }', 'callback={ job: "comparison", status: "started" }', R('true', 'updateIfCurrent("sub-1", { attempt: 1, status: "PROCESSING" }, { stage: "COMPARISON", stageStartedAt: now })'), 'Normal', async () => {
    const { service, updates } = setup(record()); assert.equal(await service.apply(callback()), true); assert.deepEqual(updates[0], { id: 'sub-1', expected: { attempt: 1, status: 'PROCESSING' }, data: { stage: 'COMPARISON', stageStartedAt: now } });
  });
  tc('stored sub-1 at stage COMPARISON', 'callback={ job: "quality_check", status: "started" } (late, out of order)', R('false (stages never move backwards, GBR-63)', 'no update'), 'Abnormal', async () => { const { service, updates } = setup(record({ stage: 'COMPARISON' })); assert.equal(await service.apply(callback({ job: 'quality_check' })), false); assert.equal(updates.length, 0); });
  tc('stored sub-1 at stage COMPARISON', 'callback={ job: "comparison", status: "started" } (same stage again)', R('true (same stage allowed)'), 'Boundary', async () => { const { service } = setup(record({ stage: 'COMPARISON' })); assert.equal(await service.apply(callback()), true); });
  tc('stored sub-1', 'callback={ job: "feedback", status: "done", result: { overallScore: 82.5, teacherTempoBpm: 90, studentTempoBpm: 99, aiFeedback } }', R('true', 'update { status: "COMPLETED", stage: "FEEDBACK", accuracy: 82.5, tempoDeviation: 10, aiFeedback: "Giữ nhịp tốt.", analyzedAt: now }'), 'Normal', async () => {
    const { service, updates } = setup(record()); await service.apply(callback({ job: 'feedback', status: 'done', result }));
    assert.deepEqual([updates[0].data.status, updates[0].data.accuracy, updates[0].data.tempoDeviation, updates[0].data.aiFeedback, updates[0].data.analyzedAt], ['COMPLETED', 82.5, 10, 'Giữ nhịp tốt.', now]);
  });
  tc('stored sub-1', 'callback={ job: "comparison", status: "done" } (not the last job)', R('false'), 'Boundary', async () => { const { service, updates } = setup(record()); assert.equal(await service.apply(callback({ status: 'done' })), false); assert.equal(updates.length, 0); });
  tc('stored sub-1', 'callback={ job: "quality_check", status: "rejected", reason: "Bản thu quá nhỏ" }', R('true', 'update { status: "REJECTED", stage: "QUALITY_CHECK", rejectReason: "Bản thu quá nhỏ", errorCode: "QUALITY_REJECTED" } (GBR-12 / GBR-13)'), 'Normal', async () => {
    const { service, updates } = setup(record()); await service.apply(callback({ job: 'quality_check', status: 'rejected', reason: 'Bản thu quá nhỏ' }));
    assert.deepEqual([updates[0].data.status, updates[0].data.rejectReason, updates[0].data.errorCode], ['REJECTED', 'Bản thu quá nhỏ', 'QUALITY_REJECTED']);
  });
  tc('stored sub-1', 'callback={ status: "rejected" } without reason', R('true', 'rejectReason = "Bản thu không đạt chất lượng."'), 'Boundary', async () => { const { service, updates } = setup(record()); await service.apply(callback({ status: 'rejected' })); assert.equal(updates[0].data.rejectReason, 'Bản thu không đạt chất lượng.'); });
  tc('stored sub-1 (retryCount 0)', 'callback={ job: "audio_analysis", status: "failed" } without reason', R('true', 'update { status: "FAILED", errorCode: "EVALUATION_FAILED", errorMessage: "Xử lý bản thu thất bại.", stage: "AUDIO_ANALYSIS", retryAvailableAt: now + 5 s }'), 'Normal', async () => {
    const { service, updates } = setup(record()); await service.apply(callback({ job: 'audio_analysis', status: 'failed' }));
    assert.deepEqual([updates[0].data.status, updates[0].data.errorCode, updates[0].data.errorMessage, updates[0].data.retryAvailableAt.getTime() - now.getTime()], ['FAILED', 'EVALUATION_FAILED', 'Xử lý bản thu thất bại.', 5000]);
  });
  tc('stored sub-1 { attempt: 2 }', 'callback={ attempt: 1 } (old attempt)', R('false (callback of a previous attempt ignored)'), 'Abnormal', async () => { const { service, updates } = setup(record({ attempt: 2 })); assert.equal(await service.apply(callback()), false); assert.equal(updates.length, 0); });
  tc('findByEvaluationId → null', 'callback={ evaluationId: "ev-x" }', R('false'), 'Abnormal', async () => { const { service } = setup(null); assert.equal(await service.apply(callback({ evaluationId: 'ev-x' })), false); });
  tc('stored sub-1 COMPLETED', 'callback={ status: "started" }', R('false (finished submissions are never changed)'), 'Abnormal', async () => { const { service } = setup(record({ status: 'COMPLETED' })); assert.equal(await service.apply(callback()), false); });
  method('markFailed(record, code, message)');
  tc('record { retryCount: 1 }', 'code="PUBLISH_FAILED"; message="Không thể gửi bản thu vào hàng đợi xử lý."', R('true', 'retryAvailableAt = now + 10 s (later retries); file kept'), 'Normal', async () => {
    const { service, updates, deletions } = setup(record({ retryCount: 1 })); assert.equal(await service.markFailed(record({ retryCount: 1 }), 'PUBLISH_FAILED', 'Không thể gửi bản thu vào hàng đợi xử lý.'), true);
    assert.deepEqual([updates[0].data.retryAvailableAt.getTime() - now.getTime(), deletions.length], [10000, 0]);
  });
  tc('record { retryCount: 3 } (last attempt)', 'code="EVALUATION_FAILED"', R('true', 'retryAvailableAt null; PracticeFileService.deleteStudentFile("sub-1", now) (GBR-62)'), 'Boundary', async () => {
    const { service, updates, deletions } = setup(record({ retryCount: 3 })); await service.markFailed(record({ retryCount: 3 }), 'EVALUATION_FAILED', 'x');
    assert.deepEqual([updates[0].data.retryAvailableAt, deletions[0]], [null, ['sub-1', now]]);
  });
  tc('record { retryCount: 3 }; updateIfCurrent → false (already moved on)', 'code="EVALUATION_FAILED"', R('false', 'file not deleted'), 'Abnormal', async () => { const { service, deletions } = setup(record({ retryCount: 3 }), { claim: false }); assert.equal(await service.markFailed(record({ retryCount: 3 }), 'EVALUATION_FAILED', 'x'), false); assert.equal(deletions.length, 0); });
  method('reconcile(record)');
  tc('record COMPLETED', 'reconcile(record)', R('same record (no Rhythm call)'), 'Normal', async () => { const done = record({ status: 'COMPLETED' }); const { service } = setup(done); assert.equal(await service.reconcile(done), done); });
  tc('record PROCESSING (published); Rhythm client → { evaluationId: "ev-1", status: "completed", result }', 'reconcile(record)', R('record re-read after the update', 'update status "COMPLETED" (lost callback replayed)'), 'Normal', async () => { const { service, updates } = setup(record(), { remote: { evaluationId: 'ev-1', status: 'completed', result } }); await service.reconcile(record()); assert.equal(updates[0].data.status, 'COMPLETED'); });
  tc('record PROCESSING at AUDIO_ANALYSIS; Rhythm → { status: "processing", stage: "comparison" }', 'reconcile(record)', R('record', 'update stage "COMPARISON" (callback lost)'), 'Normal', async () => { const { service, updates } = setup(record(), { remote: { evaluationId: 'ev-1', status: 'processing', stage: 'comparison' } }); await service.reconcile(record()); assert.equal(updates[0].data.stage, 'COMPARISON'); });
  tc('record PROCESSING; Rhythm → { evaluationId: "ev-old" } (previous retry)', 'reconcile(record)', R('record', 'no update'), 'Abnormal', async () => { const { service, updates } = setup(record(), { remote: { evaluationId: 'ev-old', status: 'completed', result } }); await service.reconcile(record()); assert.equal(updates.length, 0); });
  tc('record PROCESSING; Rhythm client throws (service down)', 'reconcile(record)', R('record (stays PROCESSING, no local deadline)', 'no update'), 'Abnormal', async () => { const { service, updates } = setup(record(), { remoteError: true }); assert.equal((await service.reconcile(record())).status, 'PROCESSING'); assert.equal(updates.length, 0); });
  tc('record PROCESSING with publicationState "publish_unknown"', 'reconcile(record)', R('record', 'Rhythm not asked (job may not exist yet)'), 'Boundary', async () => { let asked = 0; const { service } = setup(record({ publicationState: 'publish_unknown' })); (service as any).client = { get: async () => { asked += 1; } }; await service.reconcile(record({ publicationState: 'publish_unknown' })); assert.equal(asked, 0); });

}
