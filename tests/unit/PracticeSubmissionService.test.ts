/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/PracticeSubmissionService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import PracticeSubmissionServiceClass from '../../src/modules/practice/service/PracticeSubmissionService.ts';
import PracticeAssignmentResolverClass from '../../src/modules/practice/service/PracticeAssignmentResolver.ts';
import EvaluationJobBuilderServiceClass from '../../src/modules/practice/service/EvaluationJobBuilderService.ts';
import PracticeFileServiceClass from '../../src/modules/practice/service/PracticeFileService.ts';
import PracticeSubmissionDTOClass from '../../src/modules/practice/dto/PracticeSubmissionDTO.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { E, R, expectAppError, method, sheet, stubSync, tc } = UnitTestKit;
  const PracticeSubmissionService: any = PracticeSubmissionServiceClass;
  const Resolver: any = PracticeAssignmentResolverClass;
  const JobBuilder: any = EvaluationJobBuilderServiceClass;
  const PracticeFileService: any = PracticeFileServiceClass;

  const M = {
    UPLOAD_INVALID: 'File ghi âm không hợp lệ hoặc bạn không có quyền sử dụng file.', SHEET_NOT_FOUND: 'Không tìm thấy bản nhạc đã chọn của bài này.',
    NO_REFERENCE: 'Bản nhạc này chưa có bản thu mẫu nên chưa thể phân tích.', BUSY: 'Bản nộp trước đang được xử lý. Vui lòng đợi hoàn tất rồi nộp bản mới.',
    NOT_FOUND: 'Không tìm thấy bản nộp.', RETRY_NOT_ALLOWED: 'Bản nộp này không thể xử lý lại.', RETRY_TOO_EARLY: 'Bạn có thể thử lại sau ít giây nữa.'
  };
  const now = new Date('2026-11-07T03:00:00Z');
  const sheetOf = (overrides: Record<string, unknown> = {}) => ({
    id: 's-tranh', pieceId: 'p1', instrumentId: 'i-tranh', kind: 'MAIN', analysisStatus: 'READY', analysisJobId: 'analysis-1',
    referenceAudio: { storageKey: 'audio/2026-11/a1.wav', status: 'READY' }, instrument: { code: 'DAN_TRANH' }, ...overrides
  });
  const candidate = (overrides: Record<string, unknown> = {}) => ({ id: 'as1', status: 'PUBLISHED', deadline: new Date('2026-12-27T16:59:00Z'), maxSubmissions: 3, currentVersionId: 'v1', currentVersion: { kind: 'SOLO' }, submissions: [], ...overrides });
  const enrollment = (overrides: Record<string, unknown> = {}) => ({ classRecord: { id: 'c1', status: 'ACTIVE', instrumentId: 'i-tranh' }, memberInstrumentId: 'i-tranh', assignments: [candidate()], ...overrides });
  const submission = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1', studentId: 'SV-1', pieceId: 'p1', sheetMusicId: 's-tranh', assignmentId: 'as1', status: 'PROCESSING', practiceMode: 'SOLO', stage: 'QUALITY_CHECK', stageStartedAt: now,
    attempt: 1, retryCount: 0, retryAvailableAt: null, fileDeletedAt: null, fileUrl: 'http://localhost:3000/uploads/audio/u1.wav', evaluationId: 'ev-1', messageId: 'msg-1',
    publicationState: 'publishing', rejectReason: null, errorCode: null, errorMessage: null, analyzedAt: null, createdAt: now, ...overrides
  });
  // Fake dependencies; `state` keeps the stored submission so findById returns what the service wrote
  const setup = (options: { upload?: unknown; sheet?: unknown; enrollments?: unknown[]; busyId?: string | null; stored?: any; publishState?: string; claim?: boolean } = {}) => {
    const state: { current: any; created: any[]; jobs: any[]; failed: any[]; claims: any[] } = { current: options.stored ?? null, created: [], jobs: [], failed: [], claims: [] };
    const repository = {
      findOwnedUpload: async (studentId: string) => (options.upload !== undefined ? options.upload : studentId === 'SV-1' ? { id: 'up-1', url: 'http://localhost:3000/uploads/audio/u1.wav' } : null),
      findSheet: async () => (options.sheet !== undefined ? options.sheet : sheetOf()),
      findClassAssignments: async () => options.enrollments ?? [enrollment()],
      createIfIdle: async (data: any) => {
        if (options.busyId) return { submission: null, busyId: options.busyId };
        state.created.push(data); state.current = submission({ assignmentId: data.assignmentId, practiceMode: data.practiceMode, evaluationId: data.evaluationId, messageId: data.messageId });
        return { submission: state.current, busyId: null };
      },
      findOwned: async () => state.current, findById: async () => state.current, findActiveProcessing: async () => state.current,
      updatePublication: async (_id: string, data: any) => { state.current = { ...state.current, ...data }; },
      updateIfCurrent: async (_id: string, expected: any, data: any) => { state.claims.push({ expected, data }); if (options.claim === false) return false; state.current = { ...state.current, ...data }; return true; }
    };
    const progress = { reconcile: async (record: any) => record, markFailed: async (record: any, code: string, message: string) => { state.failed.push([code, message]); state.current = { ...record, status: 'FAILED', errorCode: code, errorMessage: message }; } };
    const publisher = { publish: async (job: any) => { state.jobs.push(job); return options.publishState ?? 'published'; } };
    const service = new PracticeSubmissionService({ repository, progress, publisher, createReadUrl: (key: string) => `http://localhost:3000/uploads/${key}`, now: () => now });
    return { service, state };
  };

  sheet('PracticeSubmissionService', 'PR', 'src/modules/practice/service/PracticeSubmissionServiceReport.test.ts');
  method('PracticeAssignmentResolver.isAssignedSheet(sheet, classInstrumentId) / matchesMode(candidate, mode)');
  tc('N/A', 'sheet={ kind: "MAIN", instrumentId: "i-tranh" }; classInstrumentId="i-tranh"', R('true'), 'Normal', () => assert.equal(Resolver.isAssignedSheet(sheetOf(), 'i-tranh'), true));
  tc('N/A', 'sheet={ kind: "LEVEL", instrumentId: "i-tranh" }', R('false (only the main sheet counts)'), 'Abnormal', () => assert.equal(Resolver.isAssignedSheet(sheetOf({ kind: 'LEVEL' }), 'i-tranh'), false));
  tc('N/A', 'sheet of Sáo trúc; class instrument Đàn tranh', R('false'), 'Abnormal', () => assert.equal(Resolver.isAssignedSheet(sheetOf({ instrumentId: 'i-sao' }), 'i-tranh'), false));
  tc('N/A', 'candidate kind ENSEMBLE with mode "SOLO" / "ENSEMBLE"', R('false / true (solo takes never count for ensemble assignments)'), 'Normal', () => assert.deepEqual([Resolver.matchesMode(candidate({ currentVersion: { kind: 'ENSEMBLE' } }), 'SOLO'), Resolver.matchesMode(candidate({ currentVersion: { kind: 'ENSEMBLE' } }), 'ENSEMBLE')], [false, true]));
  method('PracticeAssignmentResolver.stateOf(candidate, classStatus, now)');
  tc('N/A', 'PUBLISHED, deadline future, 2 / 3 used', R('{ state: "OPEN", usedSubmissions: 2 }'), 'Normal', () => assert.deepEqual(Resolver.stateOf(candidate({ submissions: [{ status: 'COMPLETED' }, { status: 'PROCESSING' }] }), 'ACTIVE', now), { state: 'OPEN', usedSubmissions: 2 }));
  tc('N/A', 'PUBLISHED, 3 / 3 used (1 REJECTED not counted → 3 counted)', R('{ state: "EXHAUSTED", usedSubmissions: 3 }'), 'Boundary', () => assert.equal(Resolver.stateOf(candidate({ submissions: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'REJECTED' }] }), 'ACTIVE', now).state, 'EXHAUSTED'));
  tc('N/A', 'deadline = now (same instant)', R('{ state: "OPEN" } (deadline inclusive)'), 'Boundary', () => assert.equal(Resolver.stateOf(candidate({ deadline: new Date(now.getTime()) }), 'ACTIVE', now).state, 'OPEN'));
  tc('N/A', 'class ENDED / assignment CLOSED', R('{ state: "ENDED" } for both'), 'Abnormal', () => assert.deepEqual([Resolver.stateOf(candidate(), 'ENDED', now).state, Resolver.stateOf(candidate({ status: 'CLOSED' }), 'ACTIVE', now).state], ['ENDED', 'ENDED']));
  method('PracticeAssignmentResolver.pickEnrollment(enrollments, sheet, hintAssignmentId) / resolve(...)');
  const sao = enrollment({ classRecord: { id: 'c2', status: 'ACTIVE', instrumentId: 'i-sao' }, assignments: [candidate({ id: 'as9' })] });
  tc('N/A', 'enrollments=[Sáo trúc class (as9), Đàn tranh class (as1)]; sheet Đàn tranh; hint=as9', R('the Sáo trúc class (class that holds the hinted assignment)'), 'Normal', () => assert.equal(Resolver.pickEnrollment([sao, enrollment()], sheetOf(), 'as9').classRecord.id, 'c2'));
  tc('N/A', 'same enrollments; no hint', R('the Đàn tranh class (same instrument with assignments)'), 'Normal', () => assert.equal(Resolver.pickEnrollment([sao, enrollment()], sheetOf()).classRecord.id, 'c1'));
  tc('N/A', 'enrollments=[]', R('null'), 'Boundary', () => assert.equal(Resolver.pickEnrollment([], sheetOf()), null));
  tc('N/A', 'enrollment Đàn tranh with as-late (deadline 12/27, OPEN) and as-soon (deadline 11/20, OPEN); no hint', R('as-soon (open with the nearest deadline)'), 'Normal', () => assert.equal(Resolver.resolve(sheetOf(), enrollment({ assignments: [candidate({ id: 'as-late' }), candidate({ id: 'as-soon', deadline: new Date('2026-11-20T00:00:00Z') })] }), now).candidate.id, 'as-soon'));
  tc('N/A', 'enrollment with only an EXHAUSTED assignment', R('{ state: "EXHAUSTED" } (latest one returned so the UI can explain)'), 'Boundary', () => assert.equal(Resolver.resolve(sheetOf(), enrollment({ assignments: [candidate({ maxSubmissions: 1, submissions: [{ status: 'COMPLETED' }] })] }), now).state, 'EXHAUSTED'));
  tc('N/A', 'mode "ENSEMBLE"; member instrument Sáo trúc; sheet Đàn tranh', R('null (ensemble take must be on the member\'s own instrument)'), 'Abnormal', () => assert.equal(Resolver.resolve(sheetOf(), enrollment({ memberInstrumentId: 'i-sao' }), now, undefined, 'ENSEMBLE'), null));
  method('EvaluationJobBuilderService.build(sheet, ids, studentUrl, callbackPath)');
  tc('createReadUrl = key → "http://localhost:3000/uploads/" + key; now=2026-11-07T03:00Z', 'sheet Đàn tranh (analysis READY, analysisJobId "analysis-1"); ids={ evaluationId: "ev-1", messageId: "msg-1", attempt: 2 }',
    R('{ evaluationId: "ev-1", messageId: "msg-1", attempt: 2, templateUrl: ".../uploads/audio/2026-11/a1.wav", studentUrl, instrumentId (Rhythm code of DAN_TRANH), requestedAt: "2026-11-07T03:00:00.000Z", callbackUrl: "http://localhost:3000/api/v1/internal/practice-submissions/progress", templateAnalysisId: "analysis-1" }'), 'Normal', async () => {
      const job = await new JobBuilder((key: string) => `http://localhost:3000/uploads/${key}`, () => now).build(sheetOf(), { evaluationId: 'ev-1', messageId: 'msg-1', attempt: 2 }, 'http://s.wav', '/api/v1/internal/practice-submissions/progress');
      assert.deepEqual([job.templateUrl, job.requestedAt, job.callbackUrl, job.templateAnalysisId], ['http://localhost:3000/uploads/audio/2026-11/a1.wav', '2026-11-07T03:00:00.000Z', 'http://localhost:3000/api/v1/internal/practice-submissions/progress', 'analysis-1']);
    });
  tc('same', 'sheet with analysisStatus "PROCESSING"', R('job without templateAnalysisId (Rhythm analyses the template itself)'), 'Boundary', async () => {
    const job = await new JobBuilder((key: string) => key, () => now).build(sheetOf({ analysisStatus: 'PROCESSING' }), { evaluationId: 'e', messageId: 'm', attempt: 1 }, 'u', '/cb'); assert.equal('templateAnalysisId' in job, false);
  });
  method('PracticeFileService.deleteStudentFile(record, now)');
  tc('repository.deleteFileIfUnverified spy; storage.delete spy', 'record={ id: "sub-1", fileDeletedAt: null }', R('void', 'deleteFileIfUnverified("sub-1", now, deleter) called; deleter removes the key through storage.delete (GBR-62)'), 'Normal', async () => {
    const deleted: string[] = []; const repository = { deleteFileIfUnverified: async (_id: string, _now: Date, remove: (key: string) => Promise<void>) => remove('audio/u1.wav') };
    await new PracticeFileService(repository, () => ({ delete: async (key: string) => { deleted.push(key); } })).deleteStudentFile(submission(), now); assert.deepEqual(deleted, ['audio/u1.wav']);
  });
  tc('repository spy', 'record={ fileDeletedAt: 2026-11-06 }', R('void (already deleted)', 'repository not called'), 'Boundary', async () => { let calls = 0; await new PracticeFileService({ deleteFileIfUnverified: async () => { calls += 1; } }).deleteStudentFile(submission({ fileDeletedAt: new Date() }), now); assert.equal(calls, 0); });
  tc('repository.deleteFileIfUnverified stubbed → rejects; console.error spy', 'record={ fileDeletedAt: null }', R('void (error swallowed)', 'console.error "Không thể xóa file bản thu khỏi storage."'), 'Abnormal', async () => {
    const logged = stubSync(console, 'error'); await new PracticeFileService({ deleteFileIfUnverified: async () => { throw new Error('disk'); } }).deleteStudentFile(submission(), now); assert.equal(logged[0][0], 'Không thể xóa file bản thu khỏi storage.');
  });
  method('create(studentId, input)');
  tc('fake repository: SV-1 owns upload up-1; sheet Đàn tranh MAIN with READY reference audio; enrollment Đàn tranh with open assignment as1; publisher → "published"', 'studentId="SV-1"; input={ sheetMusicId: "s-tranh", studentUploadId: "up-1" }',
    R('{ id: "sub-1", status: "PROCESSING", assignmentId: "as1", practiceMode: "SOLO", maxRetries: 3, submittedAt: "2026-11-07T03:00:00.000Z" }', 'createIfIdle({ assignmentId: "as1", assignmentVersionId: "v1", practiceMode: "SOLO", fileUrl }); 1 job published; updatePublication publicationState "published"'), 'Normal', async () => {
      const { service, state } = setup(); const dto = await service.create('SV-1', { sheetMusicId: 's-tranh', studentUploadId: 'up-1' });
      assert.deepEqual([dto.status, dto.assignmentId, dto.practiceMode, dto.maxRetries, state.created[0].assignmentVersionId, state.jobs.length, state.current.publicationState], ['PROCESSING', 'as1', 'SOLO', 3, 'v1', 1, 'published']);
    });
  tc('same; input.shareAfterVerification=true', 'input={ ..., shareAfterVerification: true }', R('submission created', 'createIfIdle data { shareConsent: true, consentUpdatedAt: now }'), 'Normal', async () => { const { service, state } = setup(); await service.create('SV-1', { sheetMusicId: 's-tranh', studentUploadId: 'up-1', shareAfterVerification: true }); assert.deepEqual([state.created[0].shareConsent, state.created[0].consentUpdatedAt], [true, now]); });
  tc('same; assignment as1 closed', 'input={ sheetMusicId: "s-tranh", studentUploadId: "up-1", assignmentId: "as1" }', R('{ assignmentId: null } (counts as free practice)'), 'Boundary', async () => { const { service } = setup({ enrollments: [enrollment({ assignments: [candidate({ status: 'CLOSED' })] })] }); assert.equal((await service.create('SV-1', { sheetMusicId: 's-tranh', studentUploadId: 'up-1', assignmentId: 'as1' })).assignmentId, null); });
  tc('same; LEVEL sheet of Đàn tranh', 'input={ sheetMusicId: "s-level", ... }', R('{ assignmentId: null } (only the main sheet is linked to the assignment)'), 'Boundary', async () => { const { service } = setup({ sheet: sheetOf({ id: 's-level', kind: 'LEVEL' }) }); assert.equal((await service.create('SV-1', { sheetMusicId: 's-level', studentUploadId: 'up-1' })).assignmentId, null); });
  tc('findOwnedUpload → null', 'studentId="SV-2"; input={ studentUploadId: "up-1" } (upload of SV-1)', E(400, null, M.UPLOAD_INVALID), 'Abnormal', () => { const { service } = setup(); return expectAppError(() => service.create('SV-2', { sheetMusicId: 's-tranh', studentUploadId: 'up-1' }), 400, null, M.UPLOAD_INVALID); });
  tc('findSheet → null', 'input={ sheetMusicId: "s-x" }', E(404, null, M.SHEET_NOT_FOUND), 'Abnormal', () => { const { service } = setup({ sheet: null }); return expectAppError(() => service.create('SV-1', { sheetMusicId: 's-x', studentUploadId: 'up-1' }), 404, null, M.SHEET_NOT_FOUND); });
  tc('findSheet → sheet whose reference audio is PENDING', 'input={ sheetMusicId: "s-tranh" }', E(422, null, M.NO_REFERENCE), 'Abnormal', () => { const { service } = setup({ sheet: sheetOf({ referenceAudio: { storageKey: 'k', status: 'PENDING' } }) }); return expectAppError(() => service.create('SV-1', { sheetMusicId: 's-tranh', studentUploadId: 'up-1' }), 422, null, M.NO_REFERENCE); });
  tc('createIfIdle → { submission: null, busyId: "sub-0" }', 'input={ ... }', 'Return: N/A\nException: AppError(statusCode=409, details={ submissionId: "sub-0" }) – "Bản nộp trước đang được xử lý. Vui lòng đợi hoàn tất rồi nộp bản mới." (GBR-49)\nLog Message: no job published', 'Abnormal', async () => {
    const { service, state } = setup({ busyId: 'sub-0' });
    await assert.rejects(() => service.create('SV-1', { sheetMusicId: 's-tranh', studentUploadId: 'up-1' }), (error: any) => error.statusCode === 409 && error.message === M.BUSY && error.details.submissionId === 'sub-0'); assert.equal(state.jobs.length, 0);
  });
  tc('publisher → "publish_failed"', 'input={ ... }', R('{ status: "FAILED", errorMessage: "Không thể gửi bản thu vào hàng đợi xử lý." }', 'progress.markFailed("PUBLISH_FAILED", …)'), 'Abnormal', async () => {
    const { service, state } = setup({ publishState: 'publish_failed' }); const dto = await service.create('SV-1', { sheetMusicId: 's-tranh', studentUploadId: 'up-1' });
    assert.deepEqual([dto.status, dto.errorMessage, state.failed[0][0]], ['FAILED', 'Không thể gửi bản thu vào hàng đợi xử lý.', 'PUBLISH_FAILED']);
  });
  tc('publisher → "publish_unknown"', 'input={ ... }', R('{ status: "PROCESSING" } (may still reach Rhythm, reconciled later)'), 'Boundary', async () => { const { service, state } = setup({ publishState: 'publish_unknown' }); assert.equal((await service.create('SV-1', { sheetMusicId: 's-tranh', studentUploadId: 'up-1' })).status, 'PROCESSING'); assert.equal(state.failed.length, 0); });
  method('get(studentId, submissionId) / getActive(studentId, sheetMusicId)');
  tc('stored submission sub-1 of SV-1', 'get("SV-1", "sub-1")', R('SubmissionDTO { id: "sub-1" } (after progress.reconcile)'), 'Normal', async () => { const { service } = setup({ stored: submission() }); assert.equal((await service.get('SV-1', 'sub-1')).id, 'sub-1'); });
  tc('findOwned → null', 'get("SV-2", "sub-1")', E(404, null, M.NOT_FOUND), 'Abnormal', () => { const { service } = setup(); return expectAppError(() => service.get('SV-2', 'sub-1'), 404, null, M.NOT_FOUND); });
  tc('stored processing submission of piece p1', 'getActive("SV-1", "s-tranh")', R('SubmissionDTO (record screen stays locked)'), 'Normal', async () => { const { service } = setup({ stored: submission() }); assert.equal((await service.getActive('SV-1', 's-tranh')).status, 'PROCESSING'); });
  tc('stored submission now COMPLETED', 'getActive("SV-1", "s-tranh")', R('null'), 'Boundary', async () => { const { service } = setup({ stored: submission({ status: 'COMPLETED' }) }); assert.equal(await service.getActive('SV-1', 's-tranh'), null); });
  method('retry(studentId, submissionId)');
  const failed = (overrides: Record<string, unknown> = {}) => submission({ status: 'FAILED', retryCount: 1, attempt: 2, retryAvailableAt: new Date(now.getTime() - 1000), errorCode: 'EVALUATION_FAILED', ...overrides });
  tc('stored FAILED submission (retryCount 1, retry window passed); claim succeeds; publisher "published"', 'retry("SV-1", "sub-1")', R('{ status: "PROCESSING", retryCount: 2, stage: "QUALITY_CHECK", errorMessage: null }', 'updateIfCurrent expected { attempt: 2, status: "FAILED" } → attempt 3; job published again'), 'Normal', async () => {
    const { service, state } = setup({ stored: failed() }); const dto = await service.retry('SV-1', 'sub-1');
    assert.deepEqual([dto.status, dto.retryCount, dto.stage, state.claims[0].expected, state.claims[0].data.attempt, state.jobs.length], ['PROCESSING', 2, 'QUALITY_CHECK', { attempt: 2, status: 'FAILED' }, 3, 1]);
  });
  tc('stored FAILED submission with retryCount 3', 'retry("SV-1", "sub-1")', E(409, null, M.RETRY_NOT_ALLOWED) + ' (max 3 retries, GBR-59)', 'Boundary', () => { const { service } = setup({ stored: failed({ retryCount: 3 }) }); return expectAppError(() => service.retry('SV-1', 'sub-1'), 409, null, M.RETRY_NOT_ALLOWED); });
  tc('stored COMPLETED submission', 'retry(...)', E(409, null, M.RETRY_NOT_ALLOWED), 'Abnormal', () => { const { service } = setup({ stored: submission({ status: 'COMPLETED' }) }); return expectAppError(() => service.retry('SV-1', 'sub-1'), 409, null, M.RETRY_NOT_ALLOWED); });
  tc('stored FAILED submission whose file was deleted', 'retry(...)', E(409, null, M.RETRY_NOT_ALLOWED), 'Abnormal', () => { const { service } = setup({ stored: failed({ fileDeletedAt: new Date() }) }); return expectAppError(() => service.retry('SV-1', 'sub-1'), 409, null, M.RETRY_NOT_ALLOWED); });
  tc('stored FAILED submission, retryAvailableAt = now + 1 s', 'retry(...)', E(409, null, M.RETRY_TOO_EARLY), 'Boundary', () => { const { service } = setup({ stored: failed({ retryAvailableAt: new Date(now.getTime() + 1000) }) }); return expectAppError(() => service.retry('SV-1', 'sub-1'), 409, null, M.RETRY_TOO_EARLY); });
  tc('stored FAILED submission; updateIfCurrent → false (another tab retried first)', 'retry(...)', E(409, null, M.RETRY_NOT_ALLOWED), 'Abnormal', () => { const { service } = setup({ stored: failed(), claim: false }); return expectAppError(() => service.retry('SV-1', 'sub-1'), 409, null, M.RETRY_NOT_ALLOWED); });
  tc('stored FAILED submission; findSheet → null at dispatch time', 'retry(...)', R('{ status: "FAILED", errorMessage: "Chưa thể gửi yêu cầu xử lý lại." }', 'progress.markFailed("RETRY_DISPATCH_FAILED", …)'), 'Abnormal', async () => {
    const { service, state } = setup({ stored: failed(), sheet: null }); const dto = await service.retry('SV-1', 'sub-1');
    assert.deepEqual([dto.status, dto.errorMessage, state.failed[0][0]], ['FAILED', 'Chưa thể gửi yêu cầu xử lý lại.', 'RETRY_DISPATCH_FAILED']);
  });
  tc('findOwned → null', 'retry("SV-2", "sub-1")', E(404, null, M.NOT_FOUND), 'Abnormal', () => { const { service } = setup(); return expectAppError(() => service.retry('SV-2', 'sub-1'), 404, null, M.NOT_FOUND); });

}
// ----------------------------------------------------------------------
// Part 2: cases added with the boundary / decision-table review
// ----------------------------------------------------------------------
{

  const { R, method, sheet, tc } = UnitTestKit;
  const Dto: any = new (PracticeSubmissionDTOClass as any)();

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1', pieceId: 'p1', sheetMusicId: 's1', assignmentId: 'as1', status: 'COMPLETED', practiceMode: 'SOLO', stage: 'feedback',
    stageStartedAt: new Date('2026-11-06T03:00:00.000Z'), retryCount: 1, retryAvailableAt: new Date('2026-11-06T03:05:00.000Z'), fileDeletedAt: null,
    rejectReason: null, errorMessage: null, analyzedAt: new Date('2026-11-06T03:10:00.000Z'), createdAt: new Date('2026-11-06T02:55:00.000Z'), ...overrides
  });

  sheet('PracticeSubmissionService', 'PR', 'tests/unit/PracticeSubmissionDTO.test.ts', 41);
  method('PracticeSubmissionDTO.toResponse(record)');
  tc('N/A', '[EP] full COMPLETED record', R('every field mapped; dates as ISO strings; maxRetries = 3 (constant)'), 'Normal', () => {
    const dto = Dto.toResponse(record());
    assert.deepEqual(dto, {
      id: 'sub-1', pieceId: 'p1', sheetMusicId: 's1', assignmentId: 'as1', status: 'COMPLETED', practiceMode: 'SOLO', stage: 'feedback',
      stageStartedAt: '2026-11-06T03:00:00.000Z', retryCount: 1, maxRetries: 3, retryAvailableAt: '2026-11-06T03:05:00.000Z', isFileDeleted: false,
      rejectReason: null, errorMessage: null, analyzedAt: '2026-11-06T03:10:00.000Z', submittedAt: '2026-11-06T02:55:00.000Z'
    });
  });
  tc('N/A', '[DT] stageStartedAt, retryAvailableAt and analyzedAt are all null', R('each of the three fields is null (no TypeError)'), 'Boundary', () => {
    const dto = Dto.toResponse(record({ stageStartedAt: null, retryAvailableAt: null, analyzedAt: null }));
    assert.deepEqual([dto.stageStartedAt, dto.retryAvailableAt, dto.analyzedAt], [null, null, null]);
  });
  tc('N/A', '[BVA] fileDeletedAt = a date / null', R('isFileDeleted true / false'), 'Boundary', () => {
    assert.deepEqual([Dto.toResponse(record({ fileDeletedAt: new Date('2026-11-07T00:00:00Z') })).isFileDeleted, Dto.toResponse(record({ fileDeletedAt: null })).isFileDeleted], [true, false]);
  });
  tc('N/A', '[EP] status PROCESSING / COMPLETED / REJECTED / FAILED', R('status passed through unchanged'), 'Normal', () => {
    const statuses = ['PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED'];
    assert.deepEqual(statuses.map((status) => Dto.toResponse(record({ status })).status), statuses);
  });
  tc('N/A', '[EP] rejectReason "Bản thu quá nhỏ" and errorMessage "Lỗi xử lý"', R('both passed through'), 'Normal', () => {
    const dto = Dto.toResponse(record({ rejectReason: 'Bản thu quá nhỏ', errorMessage: 'Lỗi xử lý' }));
    assert.deepEqual([dto.rejectReason, dto.errorMessage], ['Bản thu quá nhỏ', 'Lỗi xử lý']);
  });
  tc('N/A', '[EP] practiceMode SOLO / ENSEMBLE', R('practiceMode passed through'), 'Normal', () => {
    assert.deepEqual([Dto.toResponse(record({ practiceMode: 'SOLO' })).practiceMode, Dto.toResponse(record({ practiceMode: 'ENSEMBLE' })).practiceMode], ['SOLO', 'ENSEMBLE']);
  });

}
