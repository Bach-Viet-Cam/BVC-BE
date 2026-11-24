/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/SubmissionCompareService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import SubmissionCompareServiceClass from '../../src/modules/practice/service/SubmissionCompareService.ts';
import CompareSegmentMatcherServiceClass from '../../src/modules/practice/service/CompareSegmentMatcherService.ts';
import PitchChartServiceClass from '../../src/modules/practice/service/PitchChartService.ts';
import PitchChartBuilderServiceClass from '../../src/modules/practice/service/PitchChartBuilderService.ts';
import AppError from '../../src/utils/AppError.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { E, R, expectAppError, method, sheet, stubSync, tc } = UnitTestKit;
  const SubmissionCompareService: any = SubmissionCompareServiceClass;
  const Matcher: any = CompareSegmentMatcherServiceClass;
  const PitchChartService: any = PitchChartServiceClass;
  const Builder: any = PitchChartBuilderServiceClass;

  const M = { NOT_FOUND: 'Không tìm thấy bản nộp.', PROCESSING: 'Bản thu đang được xử lý. Kết quả sẽ hiển thị khi phân tích hoàn tất.', DIFFERENT: 'Chỉ so sánh được hai bài nộp của cùng một bản nhạc.', PITCH: 'Chưa có dữ liệu cao độ để hiển thị biểu đồ so sánh.' };
  const issue = (id: string, kind: string, startSec: number, endSec: number, label: string, centsDifference: number | null = null) => ({ id, kind, startSec, endSec, rhythmStatus: kind === 'rhythm' ? 'fast' : null, centsDifference, label });
  const rawFile = () => ({ schemaVersion: 1, pitch: { sampleRate: 2, hopLength: 1, teacherF0Hz: [220, 220, null, 330], studentF0Hz: [221, null, 333] }, alignment: { studentFrameByTeacherFrame: [0, 0, 1, 2] } });
  const chart = { points: [[0, 220, 221]], durationSec: 2, minHz: 200, maxHz: 400, timeMap: [], issues: [] };
  const resultRecord = (id: string, day: number, overrides: Record<string, unknown> = {}) => ({
    id, status: 'COMPLETED', sheetMusicId: 's1', sheetMusic: { id: 's1', name: 'Bản chính' }, piece: { id: 'p1', title: 'Lý ngựa ô' }, createdAt: new Date(Date.UTC(2026, 10, day, 2)),
    accuracy: 70 + day, evaluationId: `ev-${id}`, pitchChart: chart, result: {}, ...overrides
  });
  const compareService = (records: Record<string, any>, charts: { getChart?: (record: any) => unknown } = {}) => new SubmissionCompareService({
    repository: { findOwnedResult: async (id: string, studentId: string) => (studentId === 'SV-1' ? records[id] ?? null : null), countCompletedUntil: async (record: any) => (record.id === 'sub-a' ? 1 : 2) },
    pitchCharts: { getChart: charts.getChart ?? (async () => chart) }
  });

  sheet('SubmissionCompareService', 'CM', 'src/modules/practice/service/SubmissionCompareServiceReport.test.ts');
  method('CompareSegmentMatcherService.match(older, newer)');
  tc('N/A', 'older=[pitch 1.0–2.0 "Lệch +40¢"]; newer=[pitch 1.2–2.0 "Lệch +25¢"] (overlap ≥ 50 % of the shorter)', R('{ segments: [{ status: "REPEATED", olderLabel: "Lệch +40¢", newerLabel: "Lệch +25¢" }], noSegmentsToCompare: false }'), 'Normal', () => {
    const result = Matcher.match([issue('p0', 'pitch', 1, 2, 'Lệch +40¢', 40)], [issue('p0', 'pitch', 1.2, 2, 'Lệch +25¢', 25)]);
    assert.deepEqual([result.segments.length, result.segments[0].status, result.segments[0].olderLabel, result.segments[0].newerLabel, result.noSegmentsToCompare], [1, 'REPEATED', 'Lệch +40¢', 'Lệch +25¢', false]);
  });
  tc('N/A', 'older=[rhythm 3.0–4.0]; newer=[]', R('[{ status: "IMPROVED", newerLabel: null }] (error fixed)'), 'Normal', () => assert.equal(Matcher.match([issue('r0', 'rhythm', 3, 4, 'Nhanh hơn bản mẫu')], []).segments[0].status, 'IMPROVED'));
  tc('N/A', 'older=[]; newer=[pitch 5.0–5.5]', R('{ segments: [{ status: "NEW" }], noSegmentsToCompare: true } (first submission had no error)'), 'Normal', () => { const result = Matcher.match([], [issue('p0', 'pitch', 5, 5.5, 'Lệch -30¢', -30)]); assert.deepEqual([result.segments[0].status, result.noSegmentsToCompare], ['NEW', true]); });
  tc('N/A', 'older=[pitch 1.0–2.0]; newer=[rhythm 1.0–2.0] (other kind at the same place)', R('[{ status: "NEW", kind: "rhythm" }] (older pitch segment left unlabelled: the stretch is still wrong, so not IMPROVED)'), 'Abnormal', () => assert.deepEqual(Matcher.match([issue('p0', 'pitch', 1, 2, 'Lệch +40¢', 40)], [issue('r0', 'rhythm', 1, 2, 'Nhanh hơn bản mẫu')]).segments.map((segment: any) => [segment.kind, segment.status]), [['rhythm', 'NEW']]));
  tc('N/A', 'older=[rhythm 1.0–1.0 (zero length)]; newer=[rhythm 0.98–1.02]', R('REPEATED (zero-length segments widened to 0.1 s)'), 'Boundary', () => assert.equal(Matcher.match([issue('r0', 'rhythm', 1, 1, 'Thiếu nốt')], [issue('r0', 'rhythm', 0.98, 1.02, 'Thiếu nốt')]).segments[0].status, 'REPEATED'));
  tc('N/A', 'older=[]; newer=[pitch 1.0–1.5, pitch 1.6–2.0] (gap 0.1 s)', R('1 merged NEW segment 1.0–2.0 keeping the label of the worse error'), 'Boundary', () => {
    const [segment] = Matcher.match([], [issue('p0', 'pitch', 1, 1.5, 'Lệch +20¢', 20), issue('p1', 'pitch', 1.6, 2, 'Lệch +60¢', 60)]).segments; assert.deepEqual([segment.startSec, segment.endSec, segment.newerLabel], [1, 2, 'Lệch +60¢']);
  });
  method('PitchChartBuilderService.parse(raw) / build(file, issues)');
  tc('N/A', 'raw = analysis file (sampleRate 2, hop 1, teacher [220, 220, null, 330], student [221, null, 333], DTW map [0, 0, 1, 2])', R('{ points: [[0, 220, 221], [0.5, 220, 221], [1, null, null], [1.5, 330, 333]], durationSec: 2 } (student pitch placed on the teacher timeline)'), 'Normal', () => {
    const built = Builder.build(Builder.parse(rawFile()), []); assert.deepEqual([built.points, built.durationSec], [[[0, 220, 221], [0.5, 220, 221], [1, null, null], [1.5, 330, 333]], 2]);
  });
  tc('N/A', 'raw = { schemaVersion: 1 } without pitch data', 'Return: N/A\nException: error thrown by parse (invalid analysis file)\nLog Message: N/A', 'Abnormal', () => assert.throws(() => Builder.parse({ schemaVersion: 1 })));
  method('PitchChartService.getChart(record, issues)');
  tc('record.pitchChart = cached chart { points: [...] }', 'getChart(record, [])', R('the cached chart', 'Rhythm client not called'), 'Normal', async () => { let calls = 0; const service = new PitchChartService({ savePitchChart: async () => undefined }, { getAnalysis: async () => { calls += 1; } }); assert.equal(await service.getChart({ id: 'sub-1', pitchChart: chart }, []), chart); assert.equal(calls, 0); });
  tc('record without cache; Rhythm client.getAnalysis → analysis file; repository.savePitchChart spy', 'getChart(record, [])', R('chart built from the file', 'savePitchChart("sub-1", chart) (cached for next views)'), 'Normal', async () => {
    const saved: any[] = []; const service = new PitchChartService({ savePitchChart: async (...args: unknown[]) => { saved.push(args); } }, { getAnalysis: async () => rawFile() });
    const built = await service.getChart({ id: 'sub-1', pitchChart: null, evaluationId: 'ev-1' }, []); assert.equal(built.points.length, 4); assert.equal(saved[0][0], 'sub-1');
  });
  tc('record without cache and without evaluationId', 'getChart(record, [])', E(422, null, M.PITCH), 'Abnormal', () => expectAppError(() => new PitchChartService({}, {}).getChart({ id: 'sub-1', pitchChart: null, evaluationId: null }, []), 422, null, M.PITCH));
  tc('Rhythm client.getAnalysis → null; console.error spy', 'getChart(record, [])', E(422, null, M.PITCH, undefined, 'console.error logs why the chart is missing'), 'Abnormal', async () => {
    const logged = stubSync(console, 'error'); await expectAppError(() => new PitchChartService({}, { getAnalysis: async () => null }).getChart({ id: 'sub-1', pitchChart: null, evaluationId: 'ev-1' }, []), 422, null, M.PITCH); assert.equal(logged.length, 1);
  });
  tc('Rhythm → analysis file; repository.savePitchChart rejects; console.error spy', 'getChart(record, [])', R('chart (a failed cache write does not break the screen)'), 'Boundary', async () => {
    stubSync(console, 'error'); const built = await new PitchChartService({ savePitchChart: async () => { throw new Error('DB'); } }, { getAnalysis: async () => rawFile() }).getChart({ id: 'sub-1', pitchChart: null, evaluationId: 'ev-1' }, []); assert.equal(built.points.length, 4);
  });
  method('compare(studentId, a, b)');
  tc('fake repository: sub-a (11/02) and sub-b (11/05), both COMPLETED, same sheet s1', 'compare("SV-1", "sub-b", "sub-a") (newer picked first)', R('{ older: { submissionId: "sub-a", attemptNo: 1 }, newer: { submissionId: "sub-b", attemptNo: 2 }, sheetMusic: { id: "s1", name: "Bản chính" }, segments: [], noSegmentsToCompare: true } (order of picking does not matter)'), 'Normal', async () => {
    const result = await compareService({ 'sub-a': resultRecord('sub-a', 2), 'sub-b': resultRecord('sub-b', 5) }).compare('SV-1', 'sub-b', 'sub-a');
    assert.deepEqual([result.older.submissionId, result.older.attemptNo, result.newer.submissionId, result.newer.attemptNo, result.sheetMusic, result.noSegmentsToCompare], ['sub-a', 1, 'sub-b', 2, { id: 's1', name: 'Bản chính' }, true]);
  });
  tc('sub-b belongs to another student', 'compare("SV-1", "sub-a", "sub-x")', E(404, null, M.NOT_FOUND), 'Abnormal', () => expectAppError(() => compareService({ 'sub-a': resultRecord('sub-a', 2) }).compare('SV-1', 'sub-a', 'sub-x'), 404, null, M.NOT_FOUND));
  tc('sub-b still PROCESSING', 'compare("SV-1", "sub-a", "sub-b")', E(409, null, M.PROCESSING), 'Abnormal', () => expectAppError(() => compareService({ 'sub-a': resultRecord('sub-a', 2), 'sub-b': resultRecord('sub-b', 5, { status: 'PROCESSING' }) }).compare('SV-1', 'sub-a', 'sub-b'), 409, null, M.PROCESSING));
  tc('sub-b of sheet s2', 'compare("SV-1", "sub-a", "sub-b")', E(400, null, M.DIFFERENT), 'Abnormal', () => expectAppError(() => compareService({ 'sub-a': resultRecord('sub-a', 2), 'sub-b': resultRecord('sub-b', 5, { sheetMusicId: 's2', sheetMusic: { id: 's2', name: 'Bản dễ' } }) }).compare('SV-1', 'sub-a', 'sub-b'), 400, null, M.DIFFERENT));
  tc('pitch chart of sub-a unavailable (getChart throws AppError 422)', 'compare("SV-1", "sub-a", "sub-b")', 'Return: N/A\nException: AppError(statusCode=422, details={ submissionId: "sub-a" }) – "Chưa có dữ liệu cao độ để hiển thị biểu đồ so sánh." (MSG-26 names the submission)\nLog Message: N/A', 'Abnormal', async () => {
    const failing = async (record: any) => { if (record.id === 'sub-a') { throw new AppError(M.PITCH, 422); } return chart; };
    await assert.rejects(() => compareService({ 'sub-a': resultRecord('sub-a', 2), 'sub-b': resultRecord('sub-b', 5) }, { getChart: failing }).compare('SV-1', 'sub-a', 'sub-b'), (error: any) => error.statusCode === 422 && error.details.submissionId === 'sub-a');
  });

}
// ----------------------------------------------------------------------
// Part 2: cases added with the boundary / decision-table review
// ----------------------------------------------------------------------
{

  const { R, method, sheet, tc } = UnitTestKit;
  const Builder: any = PitchChartBuilderServiceClass;
  const identity = (length: number): number[] => Array.from({ length }, (_unused, index) => index);

  sheet('SubmissionCompareService', 'CM', 'tests/unit/PitchChartTimeMap.test.ts', 18);
  method('PitchChartBuilderService.buildTimeMap(studentFrames, frameSec)');
  tc('frameSec = 1; studentFrames[i] = i', '[BVA] 1 frame: [0]', R('[[0, 0]]'), 'Boundary', () => assert.deepEqual(Builder.buildTimeMap([0], 1), [[0, 0]]));
  tc('frameSec = 1; studentFrames[i] = i', '[BVA] 99 frames (just below TIME_MAP_POINTS = 100)', R('step 1: 99 pairs, first [0, 0], last [98, 98]'), 'Boundary', () => {
    const map = Builder.buildTimeMap(identity(99), 1);
    assert.deepEqual([map.length, map[0], map.at(-1)], [99, [0, 0], [98, 98]]);
  });
  tc('frameSec = 1; studentFrames[i] = i', '[BVA] 100 frames (= TIME_MAP_POINTS)', R('step 1: 100 pairs; the last frame appears once'), 'Boundary', () => {
    const map = Builder.buildTimeMap(identity(100), 1);
    assert.deepEqual([map.length, map.at(-1)], [100, [99, 99]]);
  });
  tc('frameSec = 1; studentFrames[i] = i', '[BVA] 101 frames (just above TIME_MAP_POINTS)', R('step 2: 51 pairs (0, 2 … 100); the last frame 100 is reached without an extra pair'), 'Boundary', () => {
    const map = Builder.buildTimeMap(identity(101), 1);
    assert.deepEqual([map.length, map[1], map.at(-1)], [51, [2, 2], [100, 100]]);
  });
  tc('frameSec = 1; studentFrames[i] = i', '[EP] 102 frames (last index 101 is not a multiple of step 2)', R('52 pairs: 0, 2 … 100 plus the last frame 101 appended'), 'Normal', () => {
    const map = Builder.buildTimeMap(identity(102), 1);
    assert.deepEqual([map.length, map.at(-2), map.at(-1)], [52, [100, 100], [101, 101]]);
  });
  tc('frameSec = 1; studentFrames[i] = i', '[EP] 1000 frames', R('step 10: indexes 0, 10 … 990 plus 999 = 101 pairs'), 'Normal', () => {
    const map = Builder.buildTimeMap(identity(1000), 1);
    assert.deepEqual([map.length, map[1], map.at(-2), map.at(-1)], [101, [10, 10], [990, 990], [999, 999]]);
  });
  tc('frameSec = 0.0116; studentFrames [0, 3, 6]', '[EP] seconds are rounded to 2 decimals', R('[[0, 0], [0.01, 0.03], [0.02, 0.07]]'), 'Normal', () => {
    assert.deepEqual(Builder.buildTimeMap([0, 3, 6], 0.0116), [[0, 0], [0.01, 0.03], [0.02, 0.07]]);
  });
  tc('N/A', '[EG] empty studentFrames []', R('documents current behaviour: one pair with a NaN student time (index -1 is pushed); unreachable through build() because parse() needs at least 1 frame'), 'Abnormal', () => {
    const map = Builder.buildTimeMap([], 1);
    assert.equal(map.length, 1);
    assert.equal(Number.isNaN(map[0][1]), true);
  });

}
