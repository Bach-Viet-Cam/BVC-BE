/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/PracticeResultService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import PracticeResultServiceClass from '../../src/modules/practice/service/PracticeResultService.ts';
import ClassRankServiceClass from '../../src/modules/practice/service/ClassRankService.ts';
import SubmissionHistoryServiceClass from '../../src/modules/practice/service/SubmissionHistoryService.ts';
import PracticeResultDTOClass from '../../src/modules/practice/dto/PracticeResultDTO.ts';
import SubmissionHistoryDTOClass from '../../src/modules/practice/dto/SubmissionHistoryDTO.ts';
import PracticeConstant from '../../src/modules/practice/constant/PracticeConstant.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { E, R, expectAppError, method, sheet, tc } = UnitTestKit;
  const PracticeResultService: any = PracticeResultServiceClass;
  const ClassRankService: any = ClassRankServiceClass;
  const SubmissionHistoryService: any = SubmissionHistoryServiceClass;

  const NOT_FOUND = 'Không tìm thấy bản nộp.';
  const PROCESSING = 'Bản thu đang được xử lý. Kết quả sẽ hiển thị khi phân tích hoàn tất.';
  const created = new Date('2026-11-07T02:00:00Z');
  const resultRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1', studentId: 'SV-1', status: 'COMPLETED', accuracy: 82.5, createdAt: created, analyzedAt: created, fileDeletedAt: null, aiFeedback: 'Giữ nhịp tốt.',
    result: { overallScore: 82.5, teacherTempoBpm: 90, studentTempoBpm: 90, pitchErrorSegments: [], rhythmErrors: [] }, piece: { id: 'p1', title: 'Lý ngựa ô' },
    sheetMusic: { referenceAudio: { status: 'READY', storageKey: 'audio/2026-11/a1.wav' } }, studentUpload: { url: 'http://localhost:3000/uploads/audio/u1.wav', deletingAt: null },
    assignment: { id: 'as1', classId: 'c1', class: { name: 'DTR101.M1' } }, ...overrides
  });
  const setup = (stored: any, overrides: Record<string, unknown> = {}) => {
    const calls: any[] = [];
    const repository = {
      findOwnedResult: async (id: string, studentId: string) => (stored && studentId === 'SV-1' ? stored : null),
      countCompletedUntil: async () => 3,
      findCompletedAttempts: async () => [{ id: 'sub-1', accuracy: 82.5, createdAt: created }, { id: 'sub-0', accuracy: 70, createdAt: new Date('2026-11-06T02:00:00Z') }],
      findClassPeerBest: async (...args: unknown[]) => { calls.push(args); return [60, 75, 90]; }, ...overrides
    };
    const pitchCharts = { getChart: async (record: any, issues: unknown[]) => ({ submissionId: record.id, issues }) };
    return { service: new PracticeResultService({ repository, pitchCharts, classRank: new ClassRankService(), createReadUrl: (key: string) => `http://localhost:3000/uploads/${key}` }), calls };
  };

  sheet('PracticeResultService', 'RS', 'src/modules/practice/service/PracticeResultServiceReport.test.ts');
  method('ClassRankService.calculate(className, accuracy, peerScores)');
  const rank = new ClassRankService();
  tc('N/A', 'accuracy=82.4; peerScores=[60, 75, 90]', R('{ hasEnoughPeers: true, myScore: 82, classAverage: 77, betterThanPercent: 67, topPercent: 33, distribution: 11 buckets with 60, 80 (82 and 75), 90 counted }'), 'Normal', () => {
    const result = rank.calculate('DTR101.M1', 82.4, [60, 75, 90]);
    assert.deepEqual([result.hasEnoughPeers, result.myScore, result.classAverage, result.betterThanPercent, result.topPercent, result.distribution.length, result.distribution[8].count], [true, 82, 77, 67, 33, 11, 2]);
  });
  tc('N/A', 'peerScores=[60, 75] (2 classmates)', R('{ hasEnoughPeers: false, peerCount: 2, minPeers: 3, classAverage: null, distribution: [] } (GBR-53 anonymity)'), 'Boundary', () => { const result = rank.calculate('DTR101.M1', 80, [60, 75]); assert.deepEqual([result.hasEnoughPeers, result.peerCount, result.classAverage, result.distribution], [false, 2, null, []]); });
  tc('N/A', 'accuracy=40; peerScores=[60, 75, 90] (worst of the class)', R('{ betterThanPercent: 0, topPercent: 100 }'), 'Boundary', () => { const result = rank.calculate('DTR101.M1', 40, [60, 75, 90]); assert.deepEqual([result.betterThanPercent, result.topPercent], [0, 100]); });
  tc('N/A', 'accuracy=99; peerScores=[60, 75, 90] (best of the class)', R('{ betterThanPercent: 100, topPercent: 1 } (never 0 %)'), 'Boundary', () => assert.equal(rank.calculate('DTR101.M1', 99, [60, 75, 90]).topPercent, 1));
  method('getResult(studentId, submissionId)');
  tc('fake repository: sub-1 COMPLETED of SV-1 (reference audio READY, upload present); countCompletedUntil → 3', 'studentId="SV-1"; submissionId="sub-1"', R('{ submission: { id: "sub-1", status: "COMPLETED", attemptNo: 3 }, audio: { teacherUrl: "http://localhost:3000/uploads/audio/2026-11/a1.wav", studentUrl: ".../u1.wav" } }'), 'Normal', async () => {
    const { service } = setup(resultRecord()); const dto = await service.getResult('SV-1', 'sub-1'); assert.deepEqual([dto.submission.attemptNo, dto.audio.teacherUrl, dto.audio.studentUrl], [3, 'http://localhost:3000/uploads/audio/2026-11/a1.wav', 'http://localhost:3000/uploads/audio/u1.wav']);
  });
  tc('sub-1 COMPLETED with fileDeletedAt set', 'getResult("SV-1", "sub-1")', R('{ audio.studentUrl: null } (recording removed, GBR-62)'), 'Boundary', async () => { const { service } = setup(resultRecord({ fileDeletedAt: new Date() })); assert.equal((await service.getResult('SV-1', 'sub-1')).audio.studentUrl, null); });
  tc('sub-1 PROCESSING', 'getResult("SV-1", "sub-1")', R('{ submission: { status: "PROCESSING", attemptNo: 0 }, audio: { teacherUrl: null, studentUrl: null } } (FE goes back to the processing screen)'), 'Normal', async () => { const { service } = setup(resultRecord({ status: 'PROCESSING' })); const dto = await service.getResult('SV-1', 'sub-1'); assert.deepEqual([dto.submission.attemptNo, dto.audio], [0, { teacherUrl: null, studentUrl: null }]); });
  tc('findOwnedResult → null for another student', 'getResult("SV-2", "sub-1")', E(404, null, NOT_FOUND), 'Abnormal', () => { const { service } = setup(resultRecord()); return expectAppError(() => service.getResult('SV-2', 'sub-1'), 404, null, NOT_FOUND); });
  method('getHistory(studentId, submissionId)');
  tc('sub-1 COMPLETED; attempts (newest first from the repository) [sub-1 82.5, sub-0 70]; countCompletedUntil → 3', 'getHistory("SV-1", "sub-1")', R('{ pieceTitle: "Lý ngựa ô", isFirstAttempt: false, deltaPercent: 12.5, bestPercent: 83, attempts oldest first: [{ submissionId: "sub-0", attemptNo: 2 }, { submissionId: "sub-1", attemptNo: 3, isCurrent: true }] }'), 'Normal', async () => {
    const { service } = setup(resultRecord()); const history = await service.getHistory('SV-1', 'sub-1');
    assert.deepEqual(history.attempts.map((item: any) => [item.submissionId, item.attemptNo, item.isCurrent]), [['sub-0', 2, false], ['sub-1', 3, true]]);
    assert.deepEqual([history.isFirstAttempt, history.deltaPercent, history.bestPercent], [false, 12.5, 83]);
  });
  tc('sub-1 PROCESSING', 'getHistory("SV-1", "sub-1")', E(409, null, PROCESSING), 'Abnormal', () => { const { service } = setup(resultRecord({ status: 'PROCESSING' })); return expectAppError(() => service.getHistory('SV-1', 'sub-1'), 409, null, PROCESSING); });
  method('getClassRank(studentId, submissionId)');
  tc('sub-1 COMPLETED of assignment as1 (class DTR101.M1); peers [60, 75, 90]', 'getClassRank("SV-1", "sub-1")', R('{ className: "DTR101.M1", hasEnoughPeers: true, myScore: 83 }', 'findClassPeerBest("c1", "as1", "SV-1")'), 'Normal', async () => {
    const { service, calls } = setup(resultRecord()); const card = await service.getClassRank('SV-1', 'sub-1'); assert.deepEqual([card.className, card.myScore, calls[0]], ['DTR101.M1', 83, ['c1', 'as1', 'SV-1']]);
  });
  tc('sub-1 COMPLETED free practice (assignment null)', 'getClassRank("SV-1", "sub-1")', R('null (card hidden)'), 'Boundary', async () => { const { service } = setup(resultRecord({ assignment: null })); assert.equal(await service.getClassRank('SV-1', 'sub-1'), null); });
  method('getPitchChart(studentId, submissionId)');
  tc('sub-1 COMPLETED; pitch chart service fake', 'getPitchChart("SV-1", "sub-1")', R('chart of sub-1 with issues parsed from the stored result'), 'Normal', async () => { const { service } = setup(resultRecord()); assert.equal((await service.getPitchChart('SV-1', 'sub-1')).submissionId, 'sub-1'); });
  method('SubmissionHistoryService.list(studentId, query) / listPieceOptions(studentId)');
  const historyRepository = (calls: any[]) => ({
    findHistory: async (...args: unknown[]) => { calls.push(args); return { rows: [{ id: 'sub-1', pieceId: 'p1', piece: { title: 'Lý ngựa ô' }, sheetMusicId: 's1', assignmentId: 'as1', assignment: { type: 'BONUS' }, practiceMode: 'SOLO', status: 'COMPLETED', accuracy: 82.5, createdAt: created }], total: 21 }; },
    countByStatus: async () => ({ COMPLETED: 15, PROCESSING: 1, REJECTED: 3, FAILED: 2 }), hasComparableSheet: async () => true, findSubmittedPieces: async () => [{ id: 'p1', title: 'Lý ngựa ô' }]
  });
  tc('fake repository: 21 rows, counts COMPLETED 15 / PROCESSING 1 / REJECTED 3 / FAILED 2', 'query={ page: 2, limit: 20, fromDate: "2026-11-01", toDate: "2026-11-07" }',
    R('{ items: [{ id: "sub-1", kind: "BONUS", pieceTitle: "Lý ngựa ô" }], pagination: { page: 2, limit: 20, total: 21 }, overall: { total: 21, completed: 15, processing: 1, rejected: 3, failed: 2, canCompare: true } }', 'findHistory filter from = 2026-11-01T00:00:00+07:00, to = 2026-11-07T23:59:59.999+07:00; paging { skip: 20, take: 20 }'), 'Normal', async () => {
      const calls: any[] = []; const result = await new SubmissionHistoryService(historyRepository(calls)).list('SV-1', { page: 2, limit: 20, fromDate: '2026-11-01', toDate: '2026-11-07' });
      assert.deepEqual([result.items[0].kind, result.pagination, result.overall], ['BONUS', { page: 2, limit: 20, total: 21 }, { total: 21, completed: 15, processing: 1, rejected: 3, failed: 2, canCompare: true }]);
      assert.deepEqual([calls[0][1].from.toISOString(), calls[0][1].to.toISOString(), calls[0][2]], ['2026-10-31T17:00:00.000Z', '2026-11-07T16:59:59.999Z', { skip: 20, take: 20 }]);
    });
  tc('same fake', 'query={ page: 1, limit: 20 } (no dates)', R('filter.from / filter.to undefined'), 'Boundary', async () => { const calls: any[] = []; await new SubmissionHistoryService(historyRepository(calls)).list('SV-1', { page: 1, limit: 20 }); assert.deepEqual([calls[0][1].from, calls[0][1].to], [undefined, undefined]); });
  tc('same fake', 'listPieceOptions("SV-1")', R('[{ id: "p1", title: "Lý ngựa ô" }]'), 'Normal', async () => assert.deepEqual(await new SubmissionHistoryService(historyRepository([])).listPieceOptions('SV-1'), [{ id: 'p1', title: 'Lý ngựa ô' }]));

}
// ----------------------------------------------------------------------
// Part 2: cases added with the boundary / decision-table review
// ----------------------------------------------------------------------
{

  const { R, method, sheet, tc } = UnitTestKit;
  const Dto: any = new (PracticeResultDTOClass as any)();
  const HistoryDto: any = new (SubmissionHistoryDTOClass as any)();

  const DEFAULTS = {
    overallScore: 0, pitchAccuracyPercent: 0, rhythmAccuracyPercent: 0, teacherTempoBpm: null, studentTempoBpm: null, aiFeedback: '',
    rhythmSegments: [], pitchErrorSegments: [], durationSec: null, warnings: []
  };
  const fullRaw = (overrides: Record<string, unknown> = {}) => ({
    overallScore: 82.5, pitchAccuracyPercent: 80.4, rhythmAccuracyPercent: 85.6, teacherTempoBpm: 90, studentTempoBpm: 99, aiFeedback: 'Giữ nhịp tốt.',
    rhythmSegments: [{ startTime: 1, endTime: 2, status: 'fast' }], pitchErrorSegments: [{ startTime: 3, endTime: 4, averageCentsDifference: 40 }],
    studentAudioQuality: { audio: { durationSec: 12.34 }, warnings: [{ code: 'LOW_VOLUME', message: 'Bản thu hơi nhỏ' }] }, ...overrides
  });
  const analysis = (overrides: Record<string, unknown> = {}) => ({ ...DEFAULTS, ...overrides });
  const seg = (startTime: number, endTime: number, extra: Record<string, unknown> = {}) => ({ startTime, endTime, ...extra });
  const resultRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1', status: 'COMPLETED', createdAt: new Date('2026-11-07T02:00:00Z'), analyzedAt: new Date('2026-11-07T02:03:00Z'), accuracy: 82.5, aiFeedback: null,
    piece: { id: 'p1', title: 'Lý ngựa ô' }, sheetMusic: { id: 's1', name: 'Bản chính' }, assignment: { id: 'as1', title: 'Bài tuần 1', classId: 'c1' }, result: fullRaw(), ...overrides
  });
  const AUDIO = { teacherUrl: 'http://x/t.wav', studentUrl: 'http://x/s.wav' };

  sheet('PracticeResultService', 'RS', 'tests/unit/PracticeResultDTO.test.ts', 16);

  // ---------------------------------------------------------------- parseAnalysis
  method('PracticeResultDTO.parseAnalysis(raw)');
  tc('N/A', '[EP] full valid result object', R('every field mapped; durationSec 12.34 rounded to 12.3; warnings kept'), 'Normal', () => {
    assert.deepEqual(Dto.parseAnalysis(fullRaw()), {
      overallScore: 82.5, pitchAccuracyPercent: 80.4, rhythmAccuracyPercent: 85.6, teacherTempoBpm: 90, studentTempoBpm: 99, aiFeedback: 'Giữ nhịp tốt.',
      rhythmSegments: [{ startTime: 1, endTime: 2, status: 'fast' }], pitchErrorSegments: [{ startTime: 3, endTime: 4, averageCentsDifference: 40 }],
      durationSec: 12.3, warnings: [{ code: 'LOW_VOLUME', message: 'Bản thu hơi nhỏ' }]
    });
  });
  tc('N/A', '[EP] raw = null', R('defaults: scores 0, feedback "", segments [], tempo null, durationSec null, warnings []'), 'Abnormal', () => assert.deepEqual(Dto.parseAnalysis(null), DEFAULTS));
  tc('N/A', '[EP] raw = undefined / "abc" / 42 / []', R('same defaults as null, no throw'), 'Abnormal', () => {
    for (const raw of [undefined, 'abc', 42, []]) assert.deepEqual(Dto.parseAnalysis(raw), DEFAULTS);
  });
  tc('N/A', '[EP] raw = {} (empty object)', R('same defaults'), 'Boundary', () => assert.deepEqual(Dto.parseAnalysis({}), DEFAULTS));
  tc('N/A', '[EP] overallScore = "x" (wrong type), pitchAccuracyPercent = 70', R('overallScore falls back to 0; pitchAccuracyPercent 70 is kept'), 'Abnormal', () => {
    const parsed = Dto.parseAnalysis({ overallScore: 'x', pitchAccuracyPercent: 70 });
    assert.deepEqual([parsed.overallScore, parsed.pitchAccuracyPercent], [0, 70]);
  });
  tc('N/A', '[BVA] teacherTempoBpm = 0', R('null (tempo must be greater than 0)'), 'Boundary', () => assert.equal(Dto.parseAnalysis({ teacherTempoBpm: 0 }).teacherTempoBpm, null));
  tc('N/A', '[BVA] teacherTempoBpm = 0.01', R('0.01 kept (smallest positive value accepted)'), 'Boundary', () => assert.equal(Dto.parseAnalysis({ teacherTempoBpm: 0.01 }).teacherTempoBpm, 0.01));
  tc('N/A', '[EP] studentTempoBpm = -5 / "90" (negative, wrong type)', R('null / null'), 'Abnormal', () => assert.deepEqual([Dto.parseAnalysis({ studentTempoBpm: -5 }).studentTempoBpm, Dto.parseAnalysis({ studentTempoBpm: '90' }).studentTempoBpm], [null, null]));
  tc('N/A', '[DT] rhythmSegments has one valid item and one with status "late"', R('the whole array falls back to []'), 'Abnormal', () => {
    assert.deepEqual(Dto.parseAnalysis({ rhythmSegments: [{ startTime: 1, endTime: 2, status: 'slow' }, { startTime: 3, endTime: 4, status: 'late' }] }).rhythmSegments, []);
  });
  tc('N/A', '[BVA] rhythm segment startTime = 0 / startTime = -0.01', R('0 accepted and kept / -0.01 rejects the array → []'), 'Boundary', () => {
    assert.equal(Dto.parseAnalysis({ rhythmSegments: [{ startTime: 0, endTime: 1, status: 'fast' }] }).rhythmSegments.length, 1);
    assert.deepEqual(Dto.parseAnalysis({ rhythmSegments: [{ startTime: -0.01, endTime: 1, status: 'fast' }] }).rhythmSegments, []);
  });
  tc('N/A', '[EP] pitchErrorSegments item without averageCentsDifference', R('pitchErrorSegments → []'), 'Abnormal', () => assert.deepEqual(Dto.parseAnalysis({ pitchErrorSegments: [{ startTime: 1, endTime: 2 }] }).pitchErrorSegments, []));
  tc('N/A', '[BVA] studentAudioQuality.audio.durationSec = 0', R('audio is rejected (must be positive) → durationSec null'), 'Boundary', () => assert.equal(Dto.parseAnalysis({ studentAudioQuality: { audio: { durationSec: 0 }, warnings: [] } }).durationSec, null));
  tc('N/A', '[BVA] durationSec = 0.04', R('0 (rounded to 1 decimal, not null). Documents current behaviour'), 'Boundary', () => assert.equal(Dto.parseAnalysis({ studentAudioQuality: { audio: { durationSec: 0.04 }, warnings: [] } }).durationSec, 0));
  tc('N/A', '[BVA] durationSec = 12.36 / 12.34 (rounding to 1 decimal)', R('12.4 / 12.3'), 'Boundary', () => {
    const duration = (durationSec: number) => Dto.parseAnalysis({ studentAudioQuality: { audio: { durationSec }, warnings: [] } }).durationSec;
    assert.deepEqual([duration(12.36), duration(12.34)], [12.4, 12.3]);
  });
  tc('N/A', '[EP] warnings = [{ code, message }]', R('passed through unchanged'), 'Normal', () => {
    const warnings = [{ code: 'NOISY', message: 'Nhiều tạp âm' }];
    assert.deepEqual(Dto.parseAnalysis({ studentAudioQuality: { audio: { durationSec: 5 }, warnings } }).warnings, warnings);
  });
  tc('N/A', '[EP] warnings item without message', R('warnings → [] while durationSec 5 is kept'), 'Abnormal', () => {
    const parsed = Dto.parseAnalysis({ studentAudioQuality: { audio: { durationSec: 5 }, warnings: [{ code: 'NOISY' }] } });
    assert.deepEqual([parsed.warnings, parsed.durationSec], [[], 5]);
  });
  tc('N/A', '[EP] studentAudioQuality = null', R('durationSec null, warnings []'), 'Normal', () => {
    const parsed = Dto.parseAnalysis({ studentAudioQuality: null });
    assert.deepEqual([parsed.durationSec, parsed.warnings], [null, []]);
  });
  tc('N/A', '[EG] extra unknown keys in the object', R('ignored, no throw'), 'Abnormal', () => {
    const parsed = Dto.parseAnalysis({ ...fullRaw(), mystery: { a: 1 }, schemaVersion: 2 });
    assert.equal(parsed.overallScore, 82.5);
    assert.equal('mystery' in parsed, false);
  });

  // ---------------------------------------------------------------- toIssues
  method('PracticeResultDTO.toIssues(analysis)');
  tc('N/A', '[BVA] no pitch and no rhythm segments', R('[]'), 'Boundary', () => assert.deepEqual(Dto.toIssues(analysis()), []));
  tc('N/A', '[EP] one pitch segment 1.0 to 2.0 with averageCentsDifference +40.4', R('{ id: "p0", kind: "pitch", centsDifference: 40, label: "Lệch +40¢", rhythmStatus: null }'), 'Normal', () => {
    assert.deepEqual(Dto.toIssues(analysis({ pitchErrorSegments: [seg(1, 2, { averageCentsDifference: 40.4 })] })), [
      { id: 'p0', kind: 'pitch', startSec: 1, endSec: 2, rhythmStatus: null, centsDifference: 40, label: 'Lệch +40¢' }
    ]);
  });
  tc('N/A', '[EP] one pitch segment with averageCentsDifference -25.6', R('centsDifference -26, label "Lệch -26¢"'), 'Normal', () => {
    const [issue] = Dto.toIssues(analysis({ pitchErrorSegments: [seg(1, 2, { averageCentsDifference: -25.6 })] }));
    assert.deepEqual([issue.centsDifference, issue.label], [-26, 'Lệch -26¢']);
  });
  tc('N/A', '[BVA] pitch averageCentsDifference 0.4 / 0', R('centsDifference 0 and label "Lệch 0¢" (no plus sign)'), 'Boundary', () => {
    const labels = [0.4, 0].map((value) => Dto.toIssues(analysis({ pitchErrorSegments: [seg(1, 2, { averageCentsDifference: value })] }))[0].label);
    assert.deepEqual(labels, ['Lệch 0¢', 'Lệch 0¢']);
  });
  tc('N/A', '[BVA] pitch averageCentsDifference 0.5 / -0.5', R('+1 → "Lệch +1¢" / -0.5 rounds to 0 → "Lệch 0¢"'), 'Boundary', () => {
    const labels = [0.5, -0.5].map((value) => Dto.toIssues(analysis({ pitchErrorSegments: [seg(1, 2, { averageCentsDifference: value })] }))[0].label);
    assert.deepEqual(labels, ['Lệch +1¢', 'Lệch 0¢']);
  });
  tc('N/A', '[EP] rhythm segments with status fast / slow / missing', R('rhythmStatus kept, label from issueLabels, centsDifference null, ids r0 r1 r2'), 'Normal', () => {
    const issues = Dto.toIssues(analysis({ rhythmSegments: [seg(1, 2, { status: 'fast' }), seg(3, 4, { status: 'slow' }), seg(5, 6, { status: 'missing' })] }));
    assert.deepEqual(issues.map((issue: any) => [issue.id, issue.rhythmStatus, issue.label, issue.centsDifference]), [
      ['r0', 'fast', PracticeConstant.issueLabels.fast, null], ['r1', 'slow', PracticeConstant.issueLabels.slow, null], ['r2', 'missing', PracticeConstant.issueLabels.missing, null]
    ]);
  });
  tc('N/A', '[DT] 2 pitch (at 5 and 1) and 2 rhythm (at 3 and 0.5) segments, not in time order', R('sorted by startSec ascending; ids keep their own-array index'), 'Normal', () => {
    const issues = Dto.toIssues(analysis({
      pitchErrorSegments: [seg(5, 6, { averageCentsDifference: 10 }), seg(1, 2, { averageCentsDifference: 20 })],
      rhythmSegments: [seg(3, 4, { status: 'slow' }), seg(0.5, 0.9, { status: 'fast' })]
    }));
    assert.deepEqual(issues.map((issue: any) => issue.id), ['r1', 'p1', 'r0', 'p0']);
  });
  tc('N/A', '[BVA] a pitch and a rhythm segment with the same startSec', R('pitch first (stable sort keeps pitch before rhythm)'), 'Boundary', () => {
    const issues = Dto.toIssues(analysis({ pitchErrorSegments: [seg(2, 3, { averageCentsDifference: 10 })], rhythmSegments: [seg(2, 3, { status: 'fast' })] }));
    assert.deepEqual(issues.map((issue: any) => issue.id), ['p0', 'r0']);
  });
  tc('N/A', '[BVA] segment startTime 1.004 and endTime 2.346', R('rounded to 2 decimals: startSec 1, endSec 2.35'), 'Boundary', () => {
    const [issue] = Dto.toIssues(analysis({ rhythmSegments: [seg(1.004, 2.346, { status: 'fast' })] }));
    assert.deepEqual([issue.startSec, issue.endSec], [1, 2.35]);
  });
  tc('N/A', '[BVA] segment with startTime = endTime', R('zero-length issue is kept'), 'Boundary', () => {
    const issues = Dto.toIssues(analysis({ rhythmSegments: [seg(4, 4, { status: 'missing' })] }));
    assert.deepEqual([issues.length, issues[0].startSec, issues[0].endSec], [1, 4, 4]);
  });

  // ---------------------------------------------------------------- toResult
  method('PracticeResultDTO.toResult(record, attemptNo, audio)');
  tc('N/A', '[EP] status FAILED / REJECTED', R('same empty shape as PROCESSING (audio is ignored)'), 'Normal', () => {
    for (const status of ['FAILED', 'REJECTED']) {
      const dto = Dto.toResult(resultRecord({ status }), 1, AUDIO);
      assert.deepEqual([dto.scores, dto.aiFeedback, dto.audio], [null, null, { teacherUrl: null, studentUrl: null }]);
    }
  });
  tc('N/A', '[EP] COMPLETED record, accuracy 82.5, attemptNo 3, teacher 90 bpm / student 99 bpm', R('complete DTO: overall 83, pitch 80, rhythm 86, tempo 80 (deviation +10%), issues sorted, ISO dates'), 'Normal', () => {
    const dto = Dto.toResult(resultRecord(), 3, AUDIO);
    assert.deepEqual(dto.scores, { overall: 83, pitch: 80, rhythm: 86, tempo: 80 });
    assert.deepEqual(dto.tempo, { teacherBpm: 90, studentBpm: 99, deviationPercent: 10 });
    assert.deepEqual([dto.submission.attemptNo, dto.submission.submittedAt, dto.submission.analyzedAt], [3, '2026-11-07T02:00:00.000Z', '2026-11-07T02:03:00.000Z']);
    assert.deepEqual([dto.sheetMusic, dto.assignment, dto.recording, dto.audio], [{ id: 's1', name: 'Bản chính' }, { id: 'as1', title: 'Bài tuần 1', classId: 'c1' }, { durationSec: 12.3 }, AUDIO]);
    assert.deepEqual(dto.issues.map((issue: any) => issue.id), ['r0', 'p0']);
    assert.deepEqual(dto.qualityWarnings, [{ code: 'LOW_VOLUME', message: 'Bản thu hơi nhỏ' }]);
  });
  tc('N/A', '[DT] record.accuracy = null and result.overallScore = 71.4', R('overall 71 (falls back to the analysis score)'), 'Normal', () => {
    assert.equal(Dto.toResult(resultRecord({ accuracy: null, result: fullRaw({ overallScore: 71.4 }) }), 1, AUDIO).scores.overall, 71);
  });
  tc('N/A', '[BVA] record.accuracy = 0 and result.overallScore = 90', R('overall 0 (zero is a real score, no fallback)'), 'Boundary', () => {
    assert.equal(Dto.toResult(resultRecord({ accuracy: 0, result: fullRaw({ overallScore: 90 }) }), 1, AUDIO).scores.overall, 0);
  });
  tc('N/A', '[BVA] record.accuracy = 100.4 / 99.5 / 49.5 / -3', R('100 / 100 / 50 / 0 (rounded, then clamped to 0-100)'), 'Boundary', () => {
    const overall = (accuracy: number) => Dto.toResult(resultRecord({ accuracy }), 1, AUDIO).scores.overall;
    assert.deepEqual([overall(100.4), overall(99.5), overall(49.5), overall(-3)], [100, 100, 50, 0]);
  });
  tc('N/A', '[DT] teacherTempoBpm missing, studentTempoBpm 99', R('scores.tempo null; tempo.deviationPercent null'), 'Normal', () => {
    const dto = Dto.toResult(resultRecord({ result: fullRaw({ teacherTempoBpm: null }) }), 1, AUDIO);
    assert.deepEqual([dto.scores.tempo, dto.tempo.deviationPercent], [null, null]);
  });
  tc('N/A', '[BVA] teacher 90 bpm and student 90 bpm (deviation 0%)', R('tempo score 100'), 'Boundary', () => {
    const dto = Dto.toResult(resultRecord({ result: fullRaw({ teacherTempoBpm: 90, studentTempoBpm: 90 }) }), 1, AUDIO);
    assert.deepEqual([dto.tempo.deviationPercent, dto.scores.tempo], [0, 100]);
  });
  tc('N/A', '[BVA] teacher 100 bpm and student 140 bpm (just below the half/double switch)', R('deviation +40%, tempo score 20 (100 - 40 x 2)'), 'Boundary', () => {
    const dto = Dto.toResult(resultRecord({ result: fullRaw({ teacherTempoBpm: 100, studentTempoBpm: 140 }) }), 1, AUDIO);
    assert.deepEqual([dto.tempo.deviationPercent, dto.scores.tempo], [40, 20]);
  });
  tc('N/A', '[BVA] teacher 100 bpm and student 142 bpm (just above the switch)', R('beat tracker half-tempo reading is closer: deviation -29%, tempo score 42'), 'Boundary', () => {
    const dto = Dto.toResult(resultRecord({ result: fullRaw({ teacherTempoBpm: 100, studentTempoBpm: 142 }) }), 1, AUDIO);
    assert.deepEqual([dto.tempo.deviationPercent, dto.scores.tempo], [-29, 42]);
  });
  tc('N/A', '[EP] record.aiFeedback "Nhận xét của giảng viên" and analysis feedback "Giữ nhịp tốt."', R('aiFeedback.text comes from record.aiFeedback, isFallback false'), 'Normal', () => {
    assert.deepEqual(Dto.toResult(resultRecord({ aiFeedback: 'Nhận xét của giảng viên' }), 1, AUDIO).aiFeedback, { text: 'Nhận xét của giảng viên', isFallback: false });
  });
  tc('N/A', '[DT] record.aiFeedback = null', R('falls back to the analysis feedback "Giữ nhịp tốt."'), 'Normal', () => {
    assert.deepEqual(Dto.toResult(resultRecord({ aiFeedback: null }), 1, AUDIO).aiFeedback, { text: 'Giữ nhịp tốt.', isFallback: false });
  });
  tc('N/A', '[BVA] feedback is only whitespace "   "', R('aiFeedback null (trimmed to empty)'), 'Boundary', () => assert.equal(Dto.toResult(resultRecord({ aiFeedback: '   ' }), 1, AUDIO).aiFeedback, null));
  tc('N/A', '[DT] feedback equals the fallback sentence / any other text', R('isFallback true / false'), 'Normal', () => {
    const flag = (aiFeedback: string) => Dto.toResult(resultRecord({ aiFeedback }), 1, AUDIO).aiFeedback.isFallback;
    assert.deepEqual([flag(PracticeConstant.fallbackFeedback), flag('Nhận xét khác')], [true, false]);
  });
  tc('N/A', '[EP] assignment = null and sheetMusic = null', R('both null in the DTO'), 'Normal', () => {
    const dto = Dto.toResult(resultRecord({ assignment: null, sheetMusic: null }), 1, AUDIO);
    assert.deepEqual([dto.assignment, dto.sheetMusic], [null, null]);
  });
  tc('N/A', '[EG] COMPLETED record whose result is a string / an array', R('DTO built from the default analysis, no throw (scores 0, issues [])'), 'Abnormal', () => {
    for (const result of ['not json', [1, 2]]) {
      const dto = Dto.toResult(resultRecord({ result, accuracy: null }), 1, AUDIO);
      assert.deepEqual([dto.scores.overall, dto.scores.tempo, dto.issues, dto.recording.durationSec], [0, null, [], null]);
    }
  });
  tc('N/A', '[BVA] analyzedAt = null on a COMPLETED record', R('submission.analyzedAt null'), 'Boundary', () => assert.equal(Dto.toResult(resultRecord({ analyzedAt: null }), 1, AUDIO).submission.analyzedAt, null));
  tc('N/A', '[EP] attemptNo = 3', R('submission.attemptNo 3, id and status copied'), 'Normal', () => {
    const dto = Dto.toResult(resultRecord(), 3, AUDIO);
    assert.deepEqual([dto.submission.id, dto.submission.attemptNo, dto.submission.status], ['sub-1', 3, 'COMPLETED']);
  });

  // ---------------------------------------------------------------- toHistory
  method('PracticeResultDTO.toHistory(record, attempts, totalAttempts)');
  const attempt = (id: string, accuracy: number | null) => ({ id, accuracy, createdAt: new Date('2026-11-07T02:00:00Z') });
  const historyRecord = (id: string) => ({ id, piece: { title: 'Lý ngựa ô' } });
  tc('N/A', '[BVA] two attempts, totalAttempts 2', R('isFirstAttempt false (boundary is totalAttempts <= 1)'), 'Boundary', () => assert.equal(Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', 50), attempt('sub-2', 60)], 2).isFirstAttempt, false));
  tc('N/A', '[EP] two attempts 50 then 72.46', R('deltaPercent 22.5 (rounded to 1 decimal); bestPercent 72'), 'Normal', () => {
    const dto = Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', 50), attempt('sub-2', 72.46)], 2);
    assert.deepEqual([dto.deltaPercent, dto.bestPercent], [22.5, 72]);
  });
  tc('N/A', '[EP] two attempts 80 then 75', R('deltaPercent -5 (negative progress)'), 'Normal', () => assert.equal(Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', 80), attempt('sub-2', 75)], 2).deltaPercent, -5));
  tc('N/A', '[BVA] two attempts with equal accuracy 60', R('deltaPercent 0'), 'Boundary', () => assert.equal(Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', 60), attempt('sub-2', 60)], 2).deltaPercent, 0));
  tc('N/A', '[EP] four attempts 50, 60, 70, 90', R('deltaPercent 20 (only the last two attempts are compared)'), 'Normal', () => {
    const attempts = [50, 60, 70, 90].map((accuracy, index) => attempt(`sub-${index + 1}`, accuracy));
    assert.equal(Dto.toHistory(historyRecord('sub-4'), attempts, 4).deltaPercent, 20);
  });
  tc('N/A', '[BVA] totalAttempts 5 but only 3 attempts returned', R('attemptNo 3, 4, 5 (numbering ends at the total)'), 'Boundary', () => {
    const dto = Dto.toHistory(historyRecord('sub-5'), [attempt('sub-3', 50), attempt('sub-4', 60), attempt('sub-5', 70)], 5);
    assert.deepEqual(dto.attempts.map((item: any) => item.attemptNo), [3, 4, 5]);
  });
  tc('N/A', '[BVA] totalAttempts 3 equal to the number of attempts', R('attemptNo 1, 2, 3'), 'Boundary', () => {
    const dto = Dto.toHistory(historyRecord('sub-3'), [attempt('sub-1', 50), attempt('sub-2', 60), attempt('sub-3', 70)], 3);
    assert.deepEqual(dto.attempts.map((item: any) => item.attemptNo), [1, 2, 3]);
  });
  tc('N/A', '[EP] an attempt with accuracy null followed by 60', R('accuracyPercent 0 and 60; deltaPercent 60 (null counts as 0)'), 'Abnormal', () => {
    const dto = Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', null), attempt('sub-2', 60)], 2);
    assert.deepEqual([dto.attempts.map((item: any) => item.accuracyPercent), dto.deltaPercent], [[0, 60], 60]);
  });
  tc('N/A', '[BVA] attempt accuracy -1 / 100.4', R('accuracyPercent clamped to 0 / 100'), 'Boundary', () => {
    const dto = Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', -1), attempt('sub-2', 100.4)], 2);
    assert.deepEqual(dto.attempts.map((item: any) => item.accuracyPercent), [0, 100]);
  });
  tc('N/A', '[EP] record is the 2nd of 3 attempts', R('isCurrent true only for the attempt whose id equals record.id'), 'Normal', () => {
    const dto = Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', 50), attempt('sub-2', 60), attempt('sub-3', 70)], 3);
    assert.deepEqual(dto.attempts.map((item: any) => item.isCurrent), [false, true, false]);
  });
  tc('N/A', '[BVA] all attempts have accuracy 0', R('bestPercent 0'), 'Boundary', () => assert.equal(Dto.toHistory(historyRecord('sub-2'), [attempt('sub-1', 0), attempt('sub-2', 0)], 2).bestPercent, 0));
  tc('N/A', '[EG] attempts [] and totalAttempts 0', R('attempts []; deltaPercent null; bestPercent 0; isFirstAttempt true; no throw'), 'Abnormal', () => {
    const dto = Dto.toHistory(historyRecord('sub-1'), [], 0);
    assert.deepEqual([dto.attempts, dto.deltaPercent, dto.bestPercent, dto.isFirstAttempt], [[], null, 0, true]);
  });

  // ---------------------------------------------------------------- SubmissionHistoryDTO
  method('SubmissionHistoryDTO.toItem(record) / toOverall(countByStatus, canCompare)');
  const historyItem = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1', pieceId: 'p1', piece: { title: 'Lý ngựa ô' }, sheetMusicId: 's1', assignmentId: 'as1', status: 'COMPLETED', practiceMode: 'SOLO',
    assignment: { type: 'REGULAR' }, accuracy: 82.5, createdAt: new Date('2026-11-07T02:00:00Z'), ...overrides
  });
  tc('N/A', '[EP] toItem with a solo class assignment (type REGULAR)', R('fields mapped; submittedAt ISO; kind SOLO'), 'Normal', () => {
    assert.deepEqual(HistoryDto.toItem(historyItem()), {
      id: 'sub-1', pieceId: 'p1', pieceTitle: 'Lý ngựa ô', sheetMusicId: 's1', assignmentId: 'as1', status: 'COMPLETED', kind: 'SOLO', accuracy: 82.5, submittedAt: '2026-11-07T02:00:00.000Z'
    });
  });
  tc('N/A', '[BVA] toItem with accuracy null', R('accuracy null (not analysed yet)'), 'Boundary', () => assert.equal(HistoryDto.toItem(historyItem({ accuracy: null, status: 'PROCESSING' })).accuracy, null));
  tc('N/A', '[BVA] toOverall({}, false)', R('every counter 0; total 0; canCompare false'), 'Boundary', () => {
    assert.deepEqual(HistoryDto.toOverall({}, false), { total: 0, completed: 0, processing: 0, rejected: 0, failed: 0, canCompare: false });
  });
  tc('N/A', '[EP] toOverall({ COMPLETED: 2 }, true)', R('other counters 0; total 2; canCompare true'), 'Normal', () => {
    assert.deepEqual(HistoryDto.toOverall({ COMPLETED: 2 }, true), { total: 2, completed: 2, processing: 0, rejected: 0, failed: 0, canCompare: true });
  });

}
