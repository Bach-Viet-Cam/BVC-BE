/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/LeaderboardService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import LeaderboardServiceClass from '../../src/modules/leaderboard/service/LeaderboardService.ts';
import LeaderboardSnapshotServiceClass from '../../src/modules/leaderboard/service/LeaderboardSnapshotService.ts';
import LeaderboardSchedulerClass from '../../src/modules/leaderboard/service/LeaderboardScheduler.ts';
import MetricClass from '../../src/modules/leaderboard/service/LeaderboardMetricCalculator.ts';
import RankingClass from '../../src/modules/leaderboard/service/LeaderboardRankingCalculator.ts';
import LeaderboardDTOClass from '../../src/modules/leaderboard/dto/LeaderboardDTO.ts';
import LeaderboardRepositoryClass from '../../src/modules/leaderboard/repository/LeaderboardRepository.ts';
import LeaderboardSourceRepositoryClass from '../../src/modules/leaderboard/repository/LeaderboardSourceRepository.ts';
import SystemConfigServiceClass from '../../src/modules/platform/service/SystemConfigService.ts';
import GradingSettingsServiceClass from '../../src/modules/platform/service/GradingSettingsService.ts';
import LeaderboardConstant from '../../src/modules/leaderboard/constant/LeaderboardConstant.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { R, method, sheet, stub, stubSync, tc } = UnitTestKit;
  const LeaderboardService: any = LeaderboardServiceClass;
  const Snapshot: any = LeaderboardSnapshotServiceClass;
  const Scheduler: any = LeaderboardSchedulerClass;
  const Metric: any = MetricClass;
  const Ranking: any = RankingClass;
  const LeaderboardDTO: any = LeaderboardDTOClass;
  const LeaderboardRepository: any = LeaderboardRepositoryClass;
  const SourceRepository: any = LeaderboardSourceRepositoryClass;
  const SystemConfigService: any = SystemConfigServiceClass;
  const GradingSettingsService: any = GradingSettingsServiceClass;

  const FA26 = { name: 'FA26', startDate: '2026-09-07', endDate: '2026-12-27' };
  const at = (iso: string) => new Date(iso);
  const sub = (assignmentId: string, accuracy: number | null, submittedAt: string, overrides: Record<string, unknown> = {}) => ({ assignmentId, kind: 'SOLO', isCounted: true, status: 'COMPLETED', accuracy, submittedAt: at(submittedAt), ...overrides });
  const activity = (instants: string[]) => ({ submissions: instants.map((instant) => sub('as1', 80, instant)), assignmentIds: [], bonusAssignments: [] });
  const query = (overrides: Record<string, unknown> = {}) => ({ category: 'overall', page: 1, limit: 50, ...overrides });
  const entry = (rank: number, studentId: string, value: number) => ({ rank, studentId, fullName: `SV ${studentId}`, className: 'DTR101.M1', value });

  sheet('LeaderboardService', 'LD', 'src/modules/leaderboard/service/LeaderboardService.test.ts');
  method('LeaderboardMetricCalculator.accuracy / weeklyImprovement');
  tc('N/A', 'accuracy([as1 60, as1 80, as2 70, bonus as3 100 (isCounted false)])', R('75 (best per counted assignment, same figure as the progress screen)'), 'Normal', () => assert.equal(Metric.accuracy([sub('as1', 60, '2026-10-01T03:00Z'), sub('as1', 80, '2026-10-02T03:00Z'), sub('as2', 70, '2026-10-03T03:00Z'), sub('as3', 100, '2026-10-03T03:00Z', { isCounted: false })]), 75));
  tc('N/A', 'weeklyImprovement(this week (from 2026-11-02) 80, 90; last week 70, weekStart "2026-11-02")', R('15 (85 − 70 percentage points)'), 'Normal', () => assert.equal(Metric.weeklyImprovement([sub('as1', 80, '2026-11-03T03:00Z'), sub('as2', 90, '2026-11-04T03:00Z'), sub('as1', 70, '2026-10-28T03:00Z')], '2026-11-02'), 15));
  tc('N/A', 'weeklyImprovement(only this week 80) / submission at 2026-11-01T17:30Z (= Mon 00:30 UTC+7) vs last week 60', R('null (no previous week) / 20 (Vietnam day decides the week)'), 'Boundary', () => assert.deepEqual([Metric.weeklyImprovement([sub('as1', 80, '2026-11-03T03:00Z')], '2026-11-02'), Metric.weeklyImprovement([sub('as1', 80, '2026-11-01T17:30Z'), sub('as1', 60, '2026-10-30T03:00Z')], '2026-11-02')], [null, 20]));
  method('LeaderboardMetricCalculator.activityDays / longestStreak / currentStreak / weeklyActivity');
  tc('N/A', 'activityDays(submissions 2026-11-01 ×2, 2026-11-02, 2026-11-04 (UTC+7 days), minPerDay 1)', R('["2026-11-01", "2026-11-02", "2026-11-04"] (sorted, one per day)'), 'Normal', () => assert.deepEqual(Metric.activityDays(activity(['2026-11-04T03:00Z', '2026-11-01T03:00Z', '2026-11-01T10:00Z', '2026-11-02T03:00Z']), 1), ['2026-11-01', '2026-11-02', '2026-11-04']));
  tc('N/A', 'longestStreak(["11-01", "11-02", "11-03", "11-05", "11-06"]) / ([])', R('3 / 0'), 'Normal', () => assert.deepEqual([Metric.longestStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']), Metric.longestStreak([])], [3, 0]));
  tc('N/A', 'currentStreak(["11-05", "11-06"], today "2026-11-07") / today "2026-11-06" / today "2026-11-08"', R('2 (ended yesterday: still current) / 2 / 0 (broken)'), 'Boundary', () => { const days = ['2026-11-03', '2026-11-05', '2026-11-06']; assert.deepEqual([Metric.currentStreak(days, '2026-11-07'), Metric.currentStreak(days, '2026-11-06'), Metric.currentStreak(days, '2026-11-08')], [2, 2, 0]); });
  tc('N/A', 'weeklyActivity(4 submissions: Sun 11-01 23:59 UTC+7, Mon 11-02, Sun 11-08, Mon 11-09; weekStart "2026-11-02")', R('2 (Mon 00:00 – Sun 23:59 UTC+7)'), 'Boundary', () => assert.equal(Metric.weeklyActivity(activity(['2026-11-01T16:59Z', '2026-11-01T17:00Z', '2026-11-08T16:59Z', '2026-11-08T17:00Z']), '2026-11-02'), 2));
  method('LeaderboardMetricCalculator.confirmedBonus / completionRate / hasActivity');
  tc('N/A', 'confirmedBonus(COMPLETED b1, FAILED b2, bonus list b1 = 5, b2 = 3, b3 = null)', R('5'), 'Normal', () => assert.equal(Metric.confirmedBonus([sub('b1', 90, '2026-11-01T03:00Z'), sub('b2', null, '2026-11-01T03:00Z', { status: 'FAILED' })], [{ id: 'b1', bonusPoints: 5 }, { id: 'b2', bonusPoints: 3 }, { id: 'b3', bonusPoints: null }]), 5));
  tc('N/A', 'completionRate(as1 best 80, as2 best 60, as3 none; assignmentIds [as1, as2, as3]; minAccuracy 70) / assignmentIds []', R('33.33 / 0'), 'Normal', () => assert.deepEqual([Metric.completionRate([sub('as1', 80, '2026-11-01T03:00Z'), sub('as2', 60, '2026-11-01T03:00Z')], ['as1', 'as2', 'as3'], 70), Metric.completionRate([], [], 70)], [33.33, 0]));
  tc('semester 2026-09-07 → 2026-12-27', 'hasActivity(submission on 2026-12-27 UTC+7) / (only on 2026-09-06)', R('true (window inclusive) / false'), 'Boundary', () => assert.deepEqual([Metric.hasActivity(activity(['2026-12-27T10:00Z']), { from: '2026-09-07', to: '2026-12-27' }), Metric.hasActivity(activity(['2026-09-06T03:00Z']), { from: '2026-09-07', to: '2026-12-27' })], [true, false]));
  method('LeaderboardRankingCalculator.normalize / overallScores / rank');
  tc('N/A', 'normalize([10, 20, null, 30]) / ([5, 5]) / ([null])', R('[0, 50, 0, 100] / [100, 100] / [0]'), 'Normal', () => assert.deepEqual([Ranking.normalize([10, 20, null, 30]), Ranking.normalize([5, 5]), Ranking.normalize([null])], [[0, 50, 0, 100], [100, 100], [0]]));
  tc('N/A', 'overallScores(SV-1 { streak 10, accuracy 90, bonus 5, completion 100 }, SV-2 { 0, 60, 0, 50 }; all 4 criteria)', R('SV-1 score 100, SV-2 score 0; normalized per criterion kept'), 'Normal', () => {
    const scores = Ranking.overallScores([{ studentId: 'SV-1', criteria: { streak: 10, accuracy: 90, bonus: 5, completion: 100 } }, { studentId: 'SV-2', criteria: { streak: 0, accuracy: 60, bonus: 0, completion: 50 } }], ['streak', 'accuracy', 'bonus', 'completion']);
    assert.deepEqual(scores.map((score: any) => [score.studentId, score.score]), [['SV-1', 100], ['SV-2', 0]]); assert.deepEqual(scores[0].normalized, { streak: 100, accuracy: 100, bonus: 100, completion: 100 });
  });
  tc('N/A', 'overallScores(rows, criteria = [])', R('score 0 for every row'), 'Boundary', () => assert.deepEqual(Ranking.overallScores([{ studentId: 'SV-1', criteria: { streak: 1, accuracy: 1, bonus: 1, completion: 1 } }], []).map((score: any) => score.score), [0]));
  tc('N/A', 'rank([SV-3 { code HE03, 80 }, SV-1 { code null, 90 }, SV-2 { code HE02, 90 }, SV-4 { code HE01, 70 }], "desc")', R('SV-2 rank 1, SV-1 rank 2 (ties: code ascending, null last), SV-3 rank 3, SV-4 rank 4 (no shared ranks)'), 'Boundary', () => assert.deepEqual(Ranking.rank([{ studentId: 'SV-3', studentCode: 'HE03', value: 80 }, { studentId: 'SV-1', studentCode: null, value: 90 }, { studentId: 'SV-2', studentCode: 'HE02', value: 90 }, { studentId: 'SV-4', studentCode: 'HE01', value: 70 }], 'desc').map((row: any) => [row.studentId, row.rank]), [['SV-2', 1], ['SV-1', 2], ['SV-3', 3], ['SV-4', 4]]));
  tc('N/A', 'rank([SV-b 5, SV-a 5] both code null, "asc")', R('SV-a rank 1, SV-b rank 2 (studentId decides)'), 'Boundary', () => assert.deepEqual(Ranking.rank([{ studentId: 'SV-b', studentCode: null, value: 5 }, { studentId: 'SV-a', studentCode: null, value: 5 }], 'asc').map((row: any) => row.studentId), ['SV-a', 'SV-b']));
  method('LeaderboardDTO.toSemesterLabel(name)');
  tc('N/A', 'name="FA26" / "SP27" / "SU27" / "2026-1"', R('"Học kỳ Thu 2026" / "Học kỳ Xuân 2027" / "Học kỳ Hè 2027" / "2026-1" (unknown shown as is)'), 'Normal', () => assert.deepEqual(['FA26', 'SP27', 'SU27', '2026-1'].map((name) => LeaderboardDTO.toSemesterLabel(name)), ['Học kỳ Thu 2026', 'Học kỳ Xuân 2027', 'Học kỳ Hè 2027', '2026-1']));
  method('LeaderboardSnapshotService.findCurrentSemester(now)');
  tc('semesters SU26 (2026-05-04 → 2026-08-23), FA26 (2026-09-07 → 2026-12-27)', 'now=2026-11-07T03:00Z / 2026-09-06T17:00Z (= 09-07 00:00 UTC+7) / 2026-09-01', R('FA26 / FA26 / null (gap between semesters, no fallback)'), 'Boundary', async () => {
    stub(SystemConfigService, 'getSemesters', () => [{ name: 'SU26', startDate: '2026-05-04', endDate: '2026-08-23' }, FA26]);
    assert.deepEqual([(await Snapshot.findCurrentSemester(at('2026-11-07T03:00:00Z')))?.name, (await Snapshot.findCurrentSemester(at('2026-09-06T17:00:00Z')))?.name, await Snapshot.findCurrentSemester(at('2026-09-01T03:00:00Z'))], ['FA26', 'FA26', null]);
  });
  method('LeaderboardSnapshotService.build(now)');
  const buildStubs = () => {
    stubSync(console, 'info');
    stub(SystemConfigService, 'getSemesters', () => [FA26]); stub(GradingSettingsService, 'getGradingSettings', () => ({ minAccuracy: 70, atRiskMargin: 10 }));
    stub(SourceRepository, 'findSemesterMembers', () => [
      { studentId: 'SV-1', studentCode: 'HE01', classId: 'c1', className: 'DTR101.M1' }, { studentId: 'SV-1', studentCode: 'HE01', classId: 'c2', className: 'DTR101.M2' },
      { studentId: 'SV-2', studentCode: 'HE02', classId: 'c1', className: 'DTR101.M1' }, { studentId: 'SV-3', studentCode: 'HE03', classId: 'c1', className: 'DTR101.M1' }
    ]);
    stub(SourceRepository, 'findSubmissions', () => [
      { studentId: 'SV-1', classId: 'c2', assignmentId: 'as2', kind: 'SOLO', assignmentStatus: 'PUBLISHED', status: 'COMPLETED', accuracy: 90, submittedAt: at('2026-11-06T03:00:00Z') },
      { studentId: 'SV-1', classId: 'c2', assignmentId: 'as2', kind: 'SOLO', assignmentStatus: 'PUBLISHED', status: 'COMPLETED', accuracy: 85, submittedAt: at('2026-11-07T01:00:00Z') },
      { studentId: 'SV-1', classId: 'c1', assignmentId: 'b1', kind: 'BONUS', assignmentStatus: 'PUBLISHED', status: 'COMPLETED', accuracy: 95, submittedAt: at('2026-11-05T03:00:00Z') },
      { studentId: 'SV-2', classId: 'c1', assignmentId: 'as1', kind: 'SOLO', assignmentStatus: 'CLOSED', status: 'COMPLETED', accuracy: 60, submittedAt: at('2026-10-10T03:00:00Z') }
    ]);
    stub(SourceRepository, 'findCountedAssignments', () => [{ id: 'as1', classId: 'c1' }, { id: 'as2', classId: 'c2' }]);
    stub(SourceRepository, 'findBonusAssignments', () => [{ id: 'b1', classId: 'c1', bonusPoints: 5 }]);
    return stub(LeaderboardRepository, 'saveSnapshot', () => 'snap-1');
  };
  tc('semester FA26; SV-1 in c1 + c2 (3 activities, 3 straight days to 11-07), SV-2 in c1 (1 activity in October), SV-3 no activity', 'now=2026-11-07T03:00Z',
    R('{ semester: "FA26", snapshotId: "snap-1", rowCount: 6 }', 'saveSnapshot(header { periodStart "2026-09-07", weekStart "2026-11-02", snapshotDate "2026-11-07" }, entries: OVERALL SV-1 #1, SV-2 #2; ACCURACY SV-1 90, SV-2 60; STREAK SV-1 3; ACTIVITY SV-1 3; IMPROVEMENT none; SV-3 skipped; SV-1 primary class c2 (more activities)'), 'Normal', async () => {
      const saved = buildStubs(); const result = await Snapshot.build(at('2026-11-07T03:00:00Z'));
      assert.deepEqual([result.semester, result.snapshotId, result.rowCount], ['FA26', 'snap-1', 6]);
      const [header, entries] = saved[0];
      assert.deepEqual([header.periodStart, header.weekStart, header.snapshotDate], ['2026-09-07', '2026-11-02', '2026-11-07']);
      const pick = (category: string) => entries.filter((item: any) => item.category === category).map((item: any) => [item.studentId, item.rank, item.value]);
      assert.deepEqual(pick('OVERALL').map((item: any) => item.slice(0, 2)), [['SV-1', 1], ['SV-2', 2]]);
      assert.deepEqual([pick('ACCURACY'), pick('STREAK'), pick('ACTIVITY'), pick('IMPROVEMENT')], [[['SV-1', 1, 90], ['SV-2', 2, 60]], [['SV-1', 1, 3]], [['SV-1', 1, 3]], []]);
      assert.equal(entries.find((item: any) => item.studentId === 'SV-1').classId, 'c2');
    });
  tc('no current semester', 'now=2026-09-01T03:00Z', R('null', 'console.info "[bảng xếp hạng] Không có học kỳ hiện tại, bỏ qua."; nothing saved'), 'Boundary', async () => { const saved = buildStubs(); const logs = stubSync(console, 'info'); assert.equal(await Snapshot.build(at('2026-09-01T03:00:00Z')), null); assert.equal(saved.length, 0); assert.ok(logs.some((call) => call[0] === '[bảng xếp hạng] Không có học kỳ hiện tại, bỏ qua.')); });
  tc('semester FA26 without members', 'now=2026-11-07T03:00Z', R('{ rowCount: 0 } (empty snapshot saved)'), 'Boundary', async () => { buildStubs(); stub(SourceRepository, 'findSemesterMembers', () => []); assert.equal((await Snapshot.build(at('2026-11-07T03:00:00Z'))).rowCount, 0); });
  tc('saveSnapshot throws Error("DB"); console.error spy', 'now=2026-11-07T03:00Z', 'Return: N/A\nException: the error is re-thrown\nLog Message: console.error "[bảng xếp hạng] Làm mới thất bại:"', 'Abnormal', async () => { buildStubs(); stub(LeaderboardRepository, 'saveSnapshot', () => { throw new Error('DB'); }); const logged = stubSync(console, 'error'); await assert.rejects(() => Snapshot.build(at('2026-11-07T03:00:00Z')), /DB/); assert.equal(logged[0][0], '[bảng xếp hạng] Làm mới thất bại:'); });
  method('LeaderboardScheduler.tick(now)');
  tc('now = 07:59 UTC+7', 'tick(2026-11-07T00:59Z)', R('no build (before 08:00)'), 'Boundary', async () => { const builds = stub(Snapshot, 'build'); await Scheduler.tick(at('2026-11-07T00:59:00Z')); assert.equal(builds.length, 0); });
  tc('now = 08:00 UTC+7; FA26 current; no snapshot today', 'tick(2026-11-07T01:00Z)', R('build(now) called once'), 'Normal', async () => { stub(SystemConfigService, 'getSemesters', () => [FA26]); stub(LeaderboardRepository, 'findBySemesterAndDate', () => null); const builds = stub(Snapshot, 'build'); await Scheduler.tick(at('2026-11-07T01:00:00Z')); assert.equal(builds.length, 1); });
  tc('today\'s snapshot already exists', 'tick(2026-11-07T05:00Z)', R('no build (once per day)'), 'Boundary', async () => { stub(SystemConfigService, 'getSemesters', () => [FA26]); const lookups = stub(LeaderboardRepository, 'findBySemesterAndDate', () => ({ id: 'snap-1' })); const builds = stub(Snapshot, 'build'); await Scheduler.tick(at('2026-11-07T05:00:00Z')); assert.deepEqual([builds.length, lookups[0]], [0, ['FA26', '2026-11-07']]); });
  tc('build throws; console.error spy', 'tick(2026-11-07T05:00Z)', R('resolves (timer keeps running)', 'console.error "Không thể làm mới bảng xếp hạng:"'), 'Abnormal', async () => { stub(SystemConfigService, 'getSemesters', () => [FA26]); stub(LeaderboardRepository, 'findBySemesterAndDate', () => null); stub(Snapshot, 'build', () => { throw new Error('x'); }); const logged = stubSync(console, 'error'); await Scheduler.tick(at('2026-11-07T05:00:00Z')); assert.equal(logged[0][0], 'Không thể làm mới bảng xếp hạng:'); });
  method('getCurrent(viewer, query)');
  const currentStubs = (options: { mine?: unknown; overall?: unknown } = {}) => {
    stub(SystemConfigService, 'getSemesters', () => [{ name: 'FA26', startDate: '2000-01-01', endDate: '2099-12-31' }]);
    stub(LeaderboardRepository, 'findLatest', () => ({ id: 'snap-1', generatedAt: at('2026-11-07T01:00:00Z') }));
    stub(LeaderboardRepository, 'countEntries', (_id: string, category: string) => (category === 'OVERALL' ? 40 : 25));
    const pages = stub(LeaderboardRepository, 'findPage', (_id: string, _c: string, skip: number) => (skip === 0 ? [entry(1, 'SV-1', 98), entry(2, 'SV-2', 95), entry(3, 'SV-3', 90)] : [entry(4 + skip - 3, 'SV-9', 70)]));
    stub(LeaderboardRepository, 'findEntry', (_id: string, category: string) => (category === 'OVERALL' ? options.overall ?? null : options.mine ?? null));
    return pages;
  };
  tc('latest FA26 snapshot (generated 08:00); 40 ranked overall, 25 in ACCURACY; student SV-7 rank 12 in ACCURACY', 'viewer=SV-7 (STUDENT); query={ category: "accuracy", page: 2, limit: 10 }',
    R('{ semester: { name: "FA26", label: "Học kỳ Thu 2026" }, generatedAt: "2026-11-07T01:00:00.000Z", totalRanked: 40, categoryTotal: 25, me: { status: "RANKED", rank: 12, value: 81 }, top3: [3 rows], items: [...], pagination: { page: 2, limit: 10, total: 22 } }', 'findPage(…, "ACCURACY", skip 13, take 10) (top 3 excluded from pages)'), 'Normal', async () => {
      const pages = currentStubs({ mine: { rank: 12, value: 81 } }); const dto = await LeaderboardService.getCurrent({ userId: 'SV-7', role: 1 }, query({ category: 'accuracy', page: 2, limit: 10 }));
      assert.deepEqual([dto.semester, dto.totalRanked, dto.categoryTotal, dto.me, dto.top3.length, dto.pagination], [{ name: 'FA26', label: 'Học kỳ Thu 2026' }, 40, 25, { status: 'RANKED', rank: 12, value: 81 }, 3, { page: 2, limit: 10, total: 22 }]);
      assert.deepEqual(pages.find((call) => call[2] !== 0)!.slice(1), ['ACCURACY', 13, 10]);
    });
  tc('student SV-7 ranked overall but not in IMPROVEMENT', 'viewer=SV-7; query={ category: "improvement" } / { category: "streak" }', R('me = { status: "NOT_IN_CATEGORY", reason: "NO_PREVIOUS_WEEK" } / { reason: "NO_DATA" }'), 'Boundary', async () => {
    currentStubs({ overall: { rank: 20, value: 50 } });
    assert.deepEqual([(await LeaderboardService.getCurrent({ userId: 'SV-7', role: 1 }, query({ category: 'improvement' }))).me, (await LeaderboardService.getCurrent({ userId: 'SV-7', role: 1 }, query({ category: 'streak' }))).me], [{ status: 'NOT_IN_CATEGORY', reason: 'NO_PREVIOUS_WEEK' }, { status: 'NOT_IN_CATEGORY', reason: 'NO_DATA' }]);
  });
  tc('student SV-8 not in the snapshot at all', 'viewer=SV-8; query={ category: "overall" }', R('me = { status: "NO_ACTIVITY" }'), 'Boundary', async () => { currentStubs(); assert.deepEqual((await LeaderboardService.getCurrent({ userId: 'SV-8', role: 1 }, query())).me, { status: 'NO_ACTIVITY' }); });
  tc('lecturer viewer', 'viewer=GV-A (TEACHER)', R('me = null (only students see their own standing)'), 'Normal', async () => { currentStubs(); assert.equal((await LeaderboardService.getCurrent({ userId: 'GV-A', role: 2 }, query())).me, null); });
  tc('FA26 has no snapshot yet', 'query={ semester: "FA26" }', R('{ semester: { name: "FA26", label: "Học kỳ Thu 2026" }, generatedAt: null, totalRanked: 0, top3: [], items: [], pagination.total 0 }'), 'Boundary', async () => { stub(LeaderboardRepository, 'findLatest', () => null); const dto = await LeaderboardService.getCurrent({ userId: 'SV-7', role: 1 }, query({ semester: 'FA26' })); assert.deepEqual([dto.semester.label, dto.generatedAt, dto.totalRanked, dto.items, dto.pagination.total], ['Học kỳ Thu 2026', null, 0, [], 0]); });
  tc('no current semester and no semester in query', 'query={ category: "overall" }', R('{ semester: null, generatedAt: null, items: [] }'), 'Abnormal', async () => { stub(SystemConfigService, 'getSemesters', () => []); const dto = await LeaderboardService.getCurrent({ userId: 'SV-7', role: 1 }, query()); assert.deepEqual([dto.semester, dto.generatedAt, dto.items], [null, null, []]); });
  tc('categoryTotal 2 (fewer than top 3)', 'query={ category: "streak", page: 1 }', R('pagination.total = 0 (never negative)'), 'Boundary', async () => { currentStubs(); stub(LeaderboardRepository, 'countEntries', () => 2); assert.equal((await LeaderboardService.getCurrent({ userId: 'GV-A', role: 2 }, query({ category: 'streak' }))).pagination.total, 0); });
  method('refresh()');
  tc('build → { generatedAt: 2026-11-07T01:00Z } / build → null', 'refresh()', R('{ generatedAt: "2026-11-07T01:00:00.000Z" } / { generatedAt: null }'), 'Normal', async () => {
    stub(Snapshot, 'build', () => ({ generatedAt: at('2026-11-07T01:00:00Z') })); const first = await LeaderboardService.refresh(); stub(Snapshot, 'build', () => null);
    assert.deepEqual([first, await LeaderboardService.refresh()], [{ generatedAt: '2026-11-07T01:00:00.000Z' }, { generatedAt: null }]);
  });

}
// ----------------------------------------------------------------------
// Part 2: cases added with the boundary / decision-table review
// ----------------------------------------------------------------------
{

  const { R, method, sheet, setValue, stub, stubSync, tc } = UnitTestKit;
  const LeaderboardService: any = LeaderboardServiceClass;
  const Snapshot: any = LeaderboardSnapshotServiceClass;
  const Scheduler: any = LeaderboardSchedulerClass;
  const Metric: any = MetricClass;
  const LeaderboardDTO: any = LeaderboardDTOClass;
  const LeaderboardRepository: any = LeaderboardRepositoryClass;
  const SourceRepository: any = LeaderboardSourceRepositoryClass;
  const SystemConfigService: any = SystemConfigServiceClass;
  const GradingSettingsService: any = GradingSettingsServiceClass;

  const FA26 = { name: 'FA26', startDate: '2026-09-07', endDate: '2026-12-27' };
  const at = (iso: string) => new Date(iso);
  const query = (overrides: Record<string, unknown> = {}) => ({ category: 'overall', page: 1, limit: 50, ...overrides });
  const entry = (rank: number, studentId: string, value: number) => ({ rank, studentId, fullName: `SV ${studentId}`, className: 'DTR101.M1', value });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  sheet('LeaderboardService', 'LD', 'tests/unit/LeaderboardServiceInternals.test.ts', 33);

  // ---------------------------------------------------------------- Scheduler.start / stop (global timers are replaced by recorders)
  const timerWorld = () => {
    const intervals: Array<{ callback: () => void; ms: number; unref: number }> = [];
    const cleared: unknown[] = [];
    setValue(Scheduler, 'timer', null);
    setValue(globalThis, 'setInterval', (callback: () => void, ms: number) => { const timer = { unref: () => { timer.unrefs += 1; }, unrefs: 0 }; intervals.push({ callback, ms, unref: 0 }); (intervals.at(-1) as any).timer = timer; return timer; });
    setValue(globalThis, 'clearInterval', (timer: unknown) => { cleared.push(timer); });
    const ticks = stub(Scheduler, 'tick');
    return { intervals, cleared, ticks };
  };
  method('LeaderboardScheduler.start()');
  tc('Scheduler.timer = null; setInterval / clearInterval replaced by recorders; tick stubbed', '[EP] start() called once', R('one interval registered; the timer is unref-ed; tick runs once immediately (catch-up after the server was off); Scheduler.timer set'), 'Normal', () => {
    const { intervals, ticks } = timerWorld();
    Scheduler.start();
    assert.deepEqual([intervals.length, (intervals[0] as any).timer.unrefs, ticks.length, Scheduler.timer !== null], [1, 1, 1, true]);
  });
  tc('Scheduler.timer = null', '[DT] start() called twice', R('the second call does nothing: one interval, one immediate tick'), 'Normal', () => {
    const { intervals, ticks } = timerWorld();
    Scheduler.start();
    Scheduler.start();
    assert.deepEqual([intervals.length, ticks.length], [1, 1]);
  });
  tc('Scheduler.timer = null', '[BVA] interval passed to setInterval', R('300000 ms (exactly 5 minutes, LeaderboardConstant.refresh.intervalMs)'), 'Boundary', () => {
    const { intervals } = timerWorld();
    Scheduler.start();
    assert.deepEqual([intervals[0].ms, LeaderboardConstant.refresh.intervalMs], [300000, 300000]);
  });
  tc('Scheduler.timer = null', '[EP] the registered interval callback fires 3 times', R('tick is called 4 times in total: 1 immediate + 3 scheduled'), 'Normal', () => {
    const { intervals, ticks } = timerWorld();
    Scheduler.start();
    for (let index = 0; index < 3; index += 1) intervals[0].callback();
    assert.equal(ticks.length, 4);
  });
  tc('Scheduler.timer = null; real tick, getSemesters rejects', '[EG] start() while the first tick fails', R('start() does not throw and the timer stays set (tick catches its own errors)'), 'Abnormal', async () => {
    setValue(Scheduler, 'timer', null);
    setValue(globalThis, 'setInterval', () => ({ unref: () => undefined }));
    stub(SystemConfigService, 'getSemesters', () => { throw new Error('DB down'); });
    stubSync(console, 'error');
    assert.doesNotThrow(() => Scheduler.start());
    await flush();
    assert.equal(Scheduler.timer !== null, true);
  });

  method('LeaderboardScheduler.stop()');
  tc('start() was called (timer set)', '[EP] stop() after start()', R('clearInterval called with the timer; Scheduler.timer is null'), 'Normal', () => {
    const { cleared } = timerWorld();
    Scheduler.start();
    const timer = Scheduler.timer;
    Scheduler.stop();
    assert.deepEqual([cleared, Scheduler.timer], [[timer], null]);
  });
  tc('Scheduler.timer = null', '[BVA] stop() when start() was never called', R('no-op: clearInterval is not called, no throw'), 'Boundary', () => {
    const { cleared } = timerWorld();
    assert.doesNotThrow(() => Scheduler.stop());
    assert.equal(cleared.length, 0);
  });
  tc('Scheduler.timer = null', '[ST] start() → stop() → start()', R('a new interval is created and tick runs again at once: 2 intervals, 2 immediate ticks'), 'Normal', () => {
    const { intervals, ticks } = timerWorld();
    Scheduler.start();
    Scheduler.stop();
    Scheduler.start();
    assert.deepEqual([intervals.length, ticks.length, Scheduler.timer !== null], [2, 2, true]);
  });

  // ---------------------------------------------------------------- Scheduler.tick edges
  method('LeaderboardScheduler.tick(now), extra edges');
  const tickWorld = (semesters: unknown[] = [FA26], existing: unknown = null) => {
    stub(SystemConfigService, 'getSemesters', () => semesters);
    const lookups = stub(LeaderboardRepository, 'findBySemesterAndDate', () => existing);
    const builds = stub(Snapshot, 'build');
    return { lookups, builds };
  };
  tc('semester FA26 current; no snapshot today', '[BVA] tick(2026-11-07T16:59Z) = 23:59 UTC+7', R('build(now) called once (the refresh may still run late in the day)'), 'Boundary', async () => {
    const { builds } = tickWorld();
    await Scheduler.tick(at('2026-11-07T16:59:00Z'));
    assert.equal(builds.length, 1);
  });
  tc('semester FA26 current', '[BVA] tick(2026-11-07T17:00Z) = 00:00 UTC+7 of the next day', R('no build and no lookup (hour 0 is before 08:00)'), 'Boundary', async () => {
    const { lookups, builds } = tickWorld();
    await Scheduler.tick(at('2026-11-07T17:00:00Z'));
    assert.deepEqual([lookups.length, builds.length], [0, 0]);
  });
  tc('no semester covers 2026-09-01 (gap between semesters)', '[EP] tick(2026-09-01T03:00Z)', R('no snapshot lookup and no build'), 'Normal', async () => {
    const { lookups, builds } = tickWorld();
    await Scheduler.tick(at('2026-09-01T03:00:00Z'));
    assert.deepEqual([lookups.length, builds.length], [0, 0]);
  });
  tc('semester FA26 current', '[EP] tick(2026-11-07T01:00Z) = 08:00 UTC+7', R('findBySemesterAndDate called with ("FA26", "2026-11-07"): semester name and the Vietnam date'), 'Normal', async () => {
    const { lookups } = tickWorld();
    await Scheduler.tick(at('2026-11-07T01:00:00Z'));
    assert.deepEqual(lookups[0], ['FA26', '2026-11-07']);
  });

  // ---------------------------------------------------------------- LeaderboardDTO.toRow / toEmpty / toSemesterLabel
  method('LeaderboardDTO.toRow(record)');
  tc('N/A', '[EP] toRow({ rank 1, studentId "SV-1", fullName, className, value 98.5, extra field })', R('{ rank, studentId, fullName, className, value } only; extra fields dropped'), 'Normal', () => {
    assert.deepEqual(LeaderboardDTO.toRow({ rank: 1, studentId: 'SV-1', fullName: 'Nguyễn Văn A', className: 'DTR101.M1', value: 98.5, secret: 'x' }), { rank: 1, studentId: 'SV-1', fullName: 'Nguyễn Văn A', className: 'DTR101.M1', value: 98.5 });
  });
  tc('N/A', '[BVA] toRow({ value: 0 })', R('value 0 is kept (not turned into null)'), 'Boundary', () => assert.equal(LeaderboardDTO.toRow({ rank: 9, studentId: 'SV-9', fullName: 'B', className: 'C', value: 0 }).value, 0));

  method('LeaderboardDTO.toEmpty(semesterName, query)');
  const EMPTY = { generatedAt: null, totalRanked: 0, categoryTotal: 0, me: null, top3: [], items: [] };
  tc('N/A', '[EP] toEmpty(null, { page 1, limit 50 })', R('{ semester: null, generatedAt: null, totalRanked 0, categoryTotal 0, me null, top3 [], items [], pagination { page 1, limit 50, total 0 } }'), 'Normal', () => {
    assert.deepEqual(LeaderboardDTO.toEmpty(null, query()), { semester: null, ...EMPTY, pagination: { page: 1, limit: 50, total: 0 } });
  });
  tc('N/A', '[EP] toEmpty("FA26", { page 1, limit 50 })', R('semester { name "FA26", label "Học kỳ Thu 2026" }, everything else empty'), 'Normal', () => {
    assert.deepEqual(LeaderboardDTO.toEmpty('FA26', query()), { semester: { name: 'FA26', label: 'Học kỳ Thu 2026' }, ...EMPTY, pagination: { page: 1, limit: 50, total: 0 } });
  });
  tc('N/A', '[EP] toEmpty("FA26", { page 3, limit 20 })', R('pagination { page 3, limit 20, total 0 } (query echoed)'), 'Normal', () => assert.deepEqual(LeaderboardDTO.toEmpty('FA26', query({ page: 3, limit: 20 })).pagination, { page: 3, limit: 20, total: 0 }));
  tc('N/A', '[EP] toEmpty("2026-1", query)', R('label is the name itself: "2026-1"'), 'Normal', () => assert.deepEqual(LeaderboardDTO.toEmpty('2026-1', query()).semester, { name: '2026-1', label: '2026-1' }));

  method('LeaderboardDTO.toSemesterLabel(name), extra edges');
  tc('N/A', '[BVA] toSemesterLabel("fa26") (lower case)', R('"fa26" unchanged (the pattern is case sensitive)'), 'Boundary', () => assert.equal(LeaderboardDTO.toSemesterLabel('fa26'), 'fa26'));
  tc('N/A', '[BVA] toSemesterLabel("FA2") / ("FA260")', R('both unchanged (exactly 2 digits required)'), 'Boundary', () => assert.deepEqual([LeaderboardDTO.toSemesterLabel('FA2'), LeaderboardDTO.toSemesterLabel('FA260')], ['FA2', 'FA260']));
  tc('N/A', '[BVA] toSemesterLabel("SU00")', R('"Học kỳ Hè 2000"'), 'Boundary', () => assert.equal(LeaderboardDTO.toSemesterLabel('SU00'), 'Học kỳ Hè 2000'));
  tc('N/A', '[EG] toSemesterLabel("")', R('"" (empty name returned as it is, no throw)'), 'Abnormal', () => assert.equal(LeaderboardDTO.toSemesterLabel(''), ''));
  tc('N/A', '[EG] toSemesterLabel(" FA26") (leading space)', R('" FA26" unchanged'), 'Abnormal', () => assert.equal(LeaderboardDTO.toSemesterLabel(' FA26'), ' FA26'));

  // ---------------------------------------------------------------- findCurrentSemester edges
  method('LeaderboardSnapshotService.findCurrentSemester(now), extra edges');
  tc('semesters [FA26 2026-09-07 → 2026-12-27]', '[BVA] findCurrentSemester(2026-12-27T16:59:59.999Z) = last millisecond of the end date in UTC+7', R('FA26 (end date is inclusive)'), 'Boundary', async () => {
    stub(SystemConfigService, 'getSemesters', () => [FA26]);
    assert.equal((await Snapshot.findCurrentSemester(at('2026-12-27T16:59:59.999Z')))?.name, 'FA26');
  });
  tc('semesters [FA26 2026-09-07 → 2026-12-27]', '[BVA] findCurrentSemester(2026-12-27T17:00:00Z) = 2026-12-28 00:00 UTC+7', R('null (the day after the end date; no fallback)'), 'Boundary', async () => {
    stub(SystemConfigService, 'getSemesters', () => [FA26]);
    assert.equal(await Snapshot.findCurrentSemester(at('2026-12-27T17:00:00Z')), null);
  });
  tc('semesters [A 2026-09-01 → 2026-12-31, FA26] both cover 2026-11-07', '[EP] findCurrentSemester(2026-11-07T03:00Z)', R('"A" (the first semester in the list wins)'), 'Normal', async () => {
    stub(SystemConfigService, 'getSemesters', () => [{ name: 'A', startDate: '2026-09-01', endDate: '2026-12-31' }, FA26]);
    assert.equal((await Snapshot.findCurrentSemester(at('2026-11-07T03:00:00Z')))?.name, 'A');
  });
  tc('semesters []', '[EP] findCurrentSemester(2026-11-07T03:00Z)', R('null'), 'Boundary', async () => {
    stub(SystemConfigService, 'getSemesters', () => []);
    assert.equal(await Snapshot.findCurrentSemester(at('2026-11-07T03:00:00Z')), null);
  });

  // ---------------------------------------------------------------- groupMemberships
  method('LeaderboardSnapshotService.groupMemberships(members)');
  const member = (studentId: string, classId: string, studentCode: string | null = 'HE01') => ({ studentId, studentCode, classId, className: classId === 'c1' ? 'DTR101.M1' : 'DTR101.M2' });
  tc('N/A', '[EP] groupMemberships([SV-1 in c1, SV-1 in c2])', R('one membership for SV-1 with classes [{ c1, "DTR101.M1" }, { c2, "DTR101.M2" }]'), 'Normal', () => {
    assert.deepEqual(Snapshot.groupMemberships([member('SV-1', 'c1'), member('SV-1', 'c2')]), [{ studentId: 'SV-1', studentCode: 'HE01', classes: [{ id: 'c1', name: 'DTR101.M1' }, { id: 'c2', name: 'DTR101.M2' }] }]);
  });
  tc('N/A', '[EP] groupMemberships([SV-1 in c1, SV-2 in c1])', R('two memberships in input order: SV-1, SV-2'), 'Normal', () => {
    assert.deepEqual(Snapshot.groupMemberships([member('SV-1', 'c1', 'HE01'), member('SV-2', 'c1', 'HE02')]).map((item: any) => item.studentId), ['SV-1', 'SV-2']);
  });
  tc('N/A', '[BVA] groupMemberships([])', R('[]'), 'Boundary', () => assert.deepEqual(Snapshot.groupMemberships([]), []));
  tc('N/A', '[EP] groupMemberships([SV-1 with studentCode null])', R('studentCode stays null'), 'Normal', () => assert.equal(Snapshot.groupMemberships([member('SV-1', 'c1', null)])[0].studentCode, null));

  // ---------------------------------------------------------------- pickPrimaryClass
  method('LeaderboardSnapshotService.pickPrimaryClass(membership, records)');
  const klass = (id: string, name: string) => ({ id, name });
  const submissions = (...classIds: Array<string | null>) => ({ studentSubmissions: classIds.map((classId) => ({ classId })) });
  const pick = (classes: any[], ...classIds: Array<string | null>) => Snapshot.pickPrimaryClass({ studentId: 'SV-1', studentCode: 'HE01', classes }, submissions(...classIds));
  const TWO = [klass('c1', 'DTR101.M1'), klass('c2', 'DTR101.M2')];
  tc('classes c1 "DTR101.M1", c2 "DTR101.M2"', '[EP] 1 submission in c1, 2 submissions in c2', R('"c2" (the class with the most activities)'), 'Normal', () => assert.equal(pick(TWO, 'c1', 'c2', 'c2'), 'c2'));
  tc('classes listed c2 then c1', '[BVA] 1 submission in each class (tie)', R('"c1" (tie goes to the class name that sorts first, not the list order)'), 'Boundary', () => assert.equal(pick([klass('c2', 'DTR101.M2'), klass('c1', 'DTR101.M1')], 'c1', 'c2'), 'c1'));
  tc('classes listed c2 then c1', '[BVA] no submissions at all', R('"c1" (all counts are 0, first by name)'), 'Boundary', () => assert.equal(pick([klass('c2', 'DTR101.M2'), klass('c1', 'DTR101.M1')]), 'c1'));
  tc('classes c1, c2', '[EP] submissions: classId null x3, c2 x1', R('"c2" (submissions with a null classId are ignored)'), 'Normal', () => assert.equal(pick(TWO, null, null, null, 'c2'), 'c2'));
  tc('classes c1, c2', '[EP] submissions: classId "c9" x5 (not a class of the student), c1 x1', R('"c1" (a class outside the membership never wins)'), 'Normal', () => assert.equal(pick(TWO, 'c9', 'c9', 'c9', 'c9', 'c9', 'c1'), 'c1'));
  tc('classes a "Bài", b "Âm nhạc"', '[EG] tie between names with accents', R('"b" (Vietnamese collation puts "Âm nhạc" before "Bài"; plain code-point order would pick "a")'), 'Abnormal', () => assert.equal(pick([klass('a', 'Bài'), klass('b', 'Âm nhạc')]), 'b'));
  tc('single class c1', '[EP] one class only, no submissions', R('"c1"'), 'Normal', () => assert.equal(pick([klass('c1', 'DTR101.M1')]), 'c1'));

  // ---------------------------------------------------------------- computeMetrics
  method('LeaderboardSnapshotService.computeMetrics(membership, activity, records, context)');
  const subRec = (assignmentId: string, accuracy: number | null, submittedAt: string, overrides: Record<string, unknown> = {}) => ({ assignmentId, kind: 'SOLO', isCounted: true, status: 'COMPLETED', accuracy, submittedAt: at(submittedAt), ...overrides });
  const metricsOf = (subs: any[], opts: { minAccuracy?: number; today?: string; weekStart?: string; assignmentIds?: string[] } = {}) => Snapshot.computeMetrics(
    { studentId: 'SV-1', studentCode: 'HE01', classes: [klass('c1', 'DTR101.M1')] },
    { submissions: subs, assignmentIds: opts.assignmentIds ?? ['as1'], bonusAssignments: [] },
    { studentSubmissions: subs.map(() => ({ classId: 'c1' })) },
    { minAccuracy: opts.minAccuracy ?? 70, today: opts.today ?? '2026-11-07', weekStart: opts.weekStart ?? '2026-11-02' }
  );
  tc('SV-1 in c1; as1 80 on 11-06 and 90 on 11-07; today 2026-11-07; weekStart 2026-11-02; minAccuracy 70', '[EP] computeMetrics(typical activity)', R('{ studentId "SV-1", classId "c1", longestStreak 2, currentStreak 2, accuracy 90, improvement null, weeklyActivity 2, bonus 0, completion 100 } equal to the calculator results'), 'Normal', () => {
    const subs = [subRec('as1', 80, '2026-11-06T03:00:00Z'), subRec('as1', 90, '2026-11-07T03:00:00Z')];
    const metrics = metricsOf(subs);
    assert.deepEqual(metrics, { studentId: 'SV-1', studentCode: 'HE01', classId: 'c1', longestStreak: 2, currentStreak: 2, accuracy: 90, improvement: null, weeklyActivity: 2, bonus: 0, completion: 100 });
    assert.equal(metrics.completion, Metric.completionRate(subs, ['as1'], 70));
  });
  tc('today 2026-11-07', '[BVA] submissions on 11-01, 11-02, 11-03 only (streak ended 4 days before today)', R('longestStreak 3 while currentStreak 0'), 'Boundary', () => {
    const metrics = metricsOf(['2026-11-01', '2026-11-02', '2026-11-03'].map((day) => subRec('as1', 70, `${day}T03:00:00Z`)));
    assert.deepEqual([metrics.longestStreak, metrics.currentStreak], [3, 0]);
  });
  tc('weekStart 2026-11-02', '[EP] only this week\'s submissions / this week 80 and last week 60', R('improvement null (no previous week) / 20'), 'Normal', () => {
    assert.equal(metricsOf([subRec('as1', 80, '2026-11-03T03:00:00Z')]).improvement, null);
    assert.equal(metricsOf([subRec('as1', 80, '2026-11-03T03:00:00Z'), subRec('as1', 60, '2026-10-27T03:00:00Z')]).improvement, 20);
  });
  tc('as1 best accuracy 80', '[EP] computeMetrics with settings minAccuracy 70 / 90', R('completion 100 / 0 (the pass mark comes from the grading settings)'), 'Normal', () => {
    const subs = [subRec('as1', 80, '2026-11-06T03:00:00Z')];
    assert.deepEqual([metricsOf(subs, { minAccuracy: 70 }).completion, metricsOf(subs, { minAccuracy: 90 }).completion], [100, 0]);
  });

  // ---------------------------------------------------------------- computeEntries
  method('LeaderboardSnapshotService.computeEntries(semester, now)');
  const NOW = at('2026-11-07T03:00:00Z');
  const sourceRow = (assignmentId: string, accuracy: number, submittedAt: string, overrides: Record<string, unknown> = {}) => (
    { studentId: 'SV-1', classId: 'c1', assignmentId, kind: 'SOLO', assignmentStatus: 'PUBLISHED', status: 'COMPLETED', accuracy, submittedAt: at(submittedAt), ...overrides });
  const sourceWorld = (options: { members?: any[]; subs?: any[]; counted?: any[]; bonus?: any[] } = {}) => {
    stub(GradingSettingsService, 'getGradingSettings', () => ({ minAccuracy: 70, atRiskMargin: 10 }));
    stub(SourceRepository, 'findSemesterMembers', () => options.members ?? [{ studentId: 'SV-1', studentCode: 'HE01', classId: 'c1', className: 'DTR101.M1' }]);
    const submissionQueries = stub(SourceRepository, 'findSubmissions', () => options.subs ?? []);
    stub(SourceRepository, 'findCountedAssignments', () => options.counted ?? [{ id: 'as1', classId: 'c1' }]);
    stub(SourceRepository, 'findBonusAssignments', () => options.bonus ?? []);
    return { submissionQueries };
  };
  const categoriesOf = (entries: any[], category: string) => entries.filter((item) => item.category === category);
  tc('findSemesterMembers → []', '[BVA] computeEntries(FA26, now) with no members', R('[] and findSubmissions is never called'), 'Boundary', async () => {
    const { submissionQueries } = sourceWorld({ members: [] });
    assert.deepEqual([await Snapshot.computeEntries(FA26, NOW), submissionQueries.length], [[], 0]);
  });
  tc('SV-1 is a member; findSubmissions → []', '[DT] computeEntries(FA26, now): the student has zero submissions', R('[] (a student without activity is skipped)'), 'Normal', async () => {
    sourceWorld({ subs: [] });
    assert.deepEqual(await Snapshot.computeEntries(FA26, NOW), []);
  });
  tc('semester starts 2026-09-07', '[BVA] one submission at 2026-09-06T03:00Z (the day before the semester starts)', R('[] (activity outside the semester window does not count)'), 'Boundary', async () => {
    sourceWorld({ subs: [sourceRow('as1', 80, '2026-09-06T03:00:00Z')] });
    assert.deepEqual(await Snapshot.computeEntries(FA26, NOW), []);
  });
  tc('semester ends 2026-12-27', '[BVA] one submission at 2026-12-27T16:59Z (23:59 UTC+7) / at 2026-12-27T17:00Z (00:00 on 12-28)', R('entries created / [] ; findSubmissions asked for from 2026-09-06T17:00Z to 2026-12-27T17:00Z (end of the last day, exclusive)'), 'Boundary', async () => {
    const { submissionQueries } = sourceWorld({ subs: [sourceRow('as1', 80, '2026-12-27T16:59:00Z')] });
    assert.equal((await Snapshot.computeEntries(FA26, NOW)).length > 0, true);
    assert.deepEqual([submissionQueries[0][2].toISOString(), submissionQueries[0][3].toISOString()], ['2026-09-06T17:00:00.000Z', '2026-12-27T17:00:00.000Z']);
    sourceWorld({ subs: [sourceRow('as1', 80, '2026-12-27T17:00:00Z')] });
    assert.deepEqual(await Snapshot.computeEntries(FA26, NOW), []);
  });
  tc('as1 COMPLETED 80 %', '[DT] assignmentStatus PUBLISHED / CLOSED / DRAFT', R('ACCURACY entry for SV-1 exists / exists / is missing (only PUBLISHED and CLOSED assignments are counted)'), 'Normal', async () => {
    const accuracyEntries = async (assignmentStatus: string) => { sourceWorld({ subs: [sourceRow('as1', 80, '2026-11-06T03:00:00Z', { assignmentStatus })] }); return categoriesOf(await Snapshot.computeEntries(FA26, NOW), 'ACCURACY').length; };
    assert.deepEqual([await accuracyEntries('PUBLISHED'), await accuracyEntries('CLOSED'), await accuracyEntries('DRAFT')], [1, 1, 0]);
  });
  tc('b1 is a bonus assignment of c1', '[DT] kind BONUS with assignmentStatus PUBLISHED', R('not counted: no ACCURACY entry, but the student still appears in OVERALL'), 'Normal', async () => {
    sourceWorld({ subs: [sourceRow('b1', 95, '2026-11-06T03:00:00Z', { kind: 'BONUS' })], counted: [], bonus: [{ id: 'b1', classId: 'c1', bonusPoints: 5 }] });
    const entries = await Snapshot.computeEntries(FA26, NOW);
    assert.deepEqual([categoriesOf(entries, 'ACCURACY').length, categoriesOf(entries, 'OVERALL').length], [0, 1]);
  });
  tc('SV-1 in c1 and c2; counted as1 (c1), as2 (c2); bonus b1 (c1, 5 points)', '[EP] computeEntries(FA26, now) for a student in two classes', R('OVERALL raw criteria { accuracy 85 (avg of 80 and 90), bonus 5, completion 100 }: counted assignments and bonuses of both classes are merged'), 'Normal', async () => {
    sourceWorld({
      members: [{ studentId: 'SV-1', studentCode: 'HE01', classId: 'c1', className: 'DTR101.M1' }, { studentId: 'SV-1', studentCode: 'HE01', classId: 'c2', className: 'DTR101.M2' }],
      subs: [sourceRow('as1', 80, '2026-11-05T03:00:00Z'), sourceRow('as2', 90, '2026-11-06T03:00:00Z', { classId: 'c2' }), sourceRow('b1', 100, '2026-11-06T04:00:00Z', { kind: 'BONUS' })],
      counted: [{ id: 'as1', classId: 'c1' }, { id: 'as2', classId: 'c2' }], bonus: [{ id: 'b1', classId: 'c1', bonusPoints: 5 }]
    });
    const overall = categoriesOf(await Snapshot.computeEntries(FA26, NOW), 'OVERALL')[0];
    assert.deepEqual([overall.criteria.raw.accuracy, overall.criteria.raw.bonus, overall.criteria.raw.completion], [85, 5, 100]);
  });
  tc('SV-1 in c1; no counted and no bonus assignments in c1', '[EP] computeEntries(FA26, now) when the class has no assignments', R('no error; OVERALL raw criteria { bonus 0, completion 0 }'), 'Boundary', async () => {
    sourceWorld({ subs: [sourceRow('as1', 80, '2026-11-06T03:00:00Z')], counted: [], bonus: [] });
    const overall = categoriesOf(await Snapshot.computeEntries(FA26, NOW), 'OVERALL')[0];
    assert.deepEqual([overall.criteria.raw.bonus, overall.criteria.raw.completion], [0, 0]);
  });

  // ---------------------------------------------------------------- buildEntries / toEntries
  method('LeaderboardSnapshotService.buildEntries(metrics) / toEntries(...)');
  const metric = (studentId: string, overrides: Record<string, unknown> = {}) => ({
    studentId, studentCode: studentId.replace('SV-', 'HE0'), classId: 'c1', longestStreak: 3, currentStreak: 2, accuracy: 80, improvement: 5, weeklyActivity: 4, bonus: 5, completion: 100, ...overrides
  });
  const idsOf = (entries: any[], category: string) => categoriesOf(entries, category).map((item) => item.studentId);
  tc('N/A', '[BVA] buildEntries([])', R('[]'), 'Boundary', () => assert.deepEqual(Snapshot.buildEntries([]), []));
  tc('N/A', '[EP] buildEntries([one student with every metric])', R('5 entries (OVERALL, ACCURACY, IMPROVEMENT, STREAK, ACTIVITY), each rank 1; OVERALL value 100 (single student normalises to 100)'), 'Normal', () => {
    const entries = Snapshot.buildEntries([metric('SV-1')]);
    assert.deepEqual([entries.length, entries.every((item: any) => item.rank === 1), categoriesOf(entries, 'OVERALL')[0].value], [5, true, 100]);
  });
  tc('N/A', '[BVA] two students with currentStreak 0 / 1', R('STREAK tab contains only the student with currentStreak 1'), 'Boundary', () => {
    assert.deepEqual(idsOf(Snapshot.buildEntries([metric('SV-1', { currentStreak: 0 }), metric('SV-2', { currentStreak: 1 })]), 'STREAK'), ['SV-2']);
  });
  tc('N/A', '[BVA] two students with weeklyActivity 0 / 1', R('ACTIVITY tab contains only the student with weeklyActivity 1'), 'Boundary', () => {
    assert.deepEqual(idsOf(Snapshot.buildEntries([metric('SV-1', { weeklyActivity: 0 }), metric('SV-2', { weeklyActivity: 1 })]), 'ACTIVITY'), ['SV-2']);
  });
  tc('N/A', '[BVA] two students with accuracy null / 0', R('ACCURACY tab contains only the student with accuracy 0 (zero is a value)'), 'Boundary', () => {
    assert.deepEqual(idsOf(Snapshot.buildEntries([metric('SV-1', { accuracy: null }), metric('SV-2', { accuracy: 0 })]), 'ACCURACY'), ['SV-2']);
  });
  tc('N/A', '[BVA] three students with improvement null / 0 / -5', R('IMPROVEMENT tab contains the students with 0 and -5 (SV-2 rank 1, SV-3 rank 2); null is excluded'), 'Boundary', () => {
    const entries = categoriesOf(Snapshot.buildEntries([metric('SV-1', { improvement: null }), metric('SV-2', { improvement: 0 }), metric('SV-3', { improvement: -5 })]), 'IMPROVEMENT');
    assert.deepEqual(entries.map((item: any) => [item.studentId, item.rank, item.value]), [['SV-2', 1, 0], ['SV-3', 2, -5]]);
  });
  tc('N/A', '[EP] buildEntries([SV-1 longestStreak 7, accuracy 80, bonus 5, completion 100])', R('OVERALL entry criteria { raw { streak 7, accuracy 80, bonus 5, completion 100 }, normalized }; the ACCURACY entry has criteria null'), 'Normal', () => {
    const entries = Snapshot.buildEntries([metric('SV-1', { longestStreak: 7, currentStreak: 1 })]);
    assert.deepEqual(categoriesOf(entries, 'OVERALL')[0].criteria.raw, { streak: 7, accuracy: 80, bonus: 5, completion: 100 });
    assert.equal(categoriesOf(entries, 'OVERALL')[0].criteria.normalized !== null, true);
    assert.equal(categoriesOf(entries, 'ACCURACY')[0].criteria, null);
  });
  tc('N/A', '[DT] two students with the same accuracy 80 (codes HE02 and HE01)', R('ranks are sequential: HE01 rank 1, HE02 rank 2 (tie broken by studentCode ascending)'), 'Normal', () => {
    const entries = categoriesOf(Snapshot.buildEntries([metric('SV-2', { studentCode: 'HE02' }), metric('SV-1', { studentCode: 'HE01' })]), 'ACCURACY');
    assert.deepEqual(entries.map((item: any) => [item.studentId, item.rank]), [['SV-1', 1], ['SV-2', 2]]);
  });
  tc('N/A', '[EP] buildEntries([SV-1 in c1, SV-2 in c2])', R('every entry carries the classId of its metric'), 'Normal', () => {
    const entries = Snapshot.buildEntries([metric('SV-1', { classId: 'c1' }), metric('SV-2', { classId: 'c2' })]);
    assert.equal(entries.every((item: any) => item.classId === (item.studentId === 'SV-1' ? 'c1' : 'c2')), true);
  });
  tc('N/A', '[EP] buildEntries([one student])', R('categories appear in the order OVERALL, ACCURACY, IMPROVEMENT, STREAK, ACTIVITY'), 'Normal', () => {
    assert.deepEqual([...new Set(Snapshot.buildEntries([metric('SV-1')]).map((item: any) => item.category))], ['OVERALL', 'ACCURACY', 'IMPROVEMENT', 'STREAK', 'ACTIVITY']);
  });
  tc('N/A', '[EP] buildEntries([SV-1 longestStreak 7, currentStreak 1])', R('OVERALL raw streak is 7 (longest streak), the STREAK tab value is 1 (current streak)'), 'Normal', () => {
    const entries = Snapshot.buildEntries([metric('SV-1', { longestStreak: 7, currentStreak: 1 })]);
    assert.deepEqual([categoriesOf(entries, 'OVERALL')[0].criteria.raw.streak, categoriesOf(entries, 'STREAK')[0].value], [7, 1]);
  });

  // ---------------------------------------------------------------- build edges
  method('LeaderboardSnapshotService.build(now), extra edges');
  const buildWorld = () => {
    stubSync(console, 'info');
    stub(SystemConfigService, 'getSemesters', () => [FA26]);
    sourceWorld({ subs: [sourceRow('as1', 80, '2026-11-06T03:00:00Z')] });
    return stub(LeaderboardRepository, 'saveSnapshot', () => 'snap-1');
  };
  tc('semester FA26; SV-1 has activity', '[EP] build(2026-11-06T03:00Z) (a Friday)', R('header { startedAt = generatedAt = now, snapshotDate "2026-11-06", weekStart "2026-11-02", periodStart "2026-09-07", periodEnd "2026-12-27" }; result { semester "FA26", snapshotId "snap-1", generatedAt now, rowCount 4 (OVERALL, ACCURACY, STREAK, ACTIVITY; no IMPROVEMENT without a previous week) }'), 'Normal', async () => {
    const saved = buildWorld();
    const now = at('2026-11-06T03:00:00Z');
    const result = await Snapshot.build(now);
    const header = saved[0][0];
    assert.deepEqual([header.startedAt === now, header.generatedAt === now, header.snapshotDate, header.weekStart, header.periodStart, header.periodEnd], [true, true, '2026-11-06', '2026-11-02', '2026-09-07', '2026-12-27']);
    assert.deepEqual([result.semester, result.snapshotId, result.generatedAt === now, result.rowCount], ['FA26', 'snap-1', true, 4]);
  });
  tc('semester FA26', '[BVA] build(2026-11-08T16:59Z) = Sunday 23:59 / build(2026-11-08T17:00Z) = Monday 00:00 (UTC+7)', R('snapshotDate "2026-11-08" and weekStart "2026-11-02" / snapshotDate "2026-11-09" and weekStart "2026-11-09"'), 'Boundary', async () => {
    const saved = buildWorld();
    await Snapshot.build(at('2026-11-08T16:59:00Z'));
    await Snapshot.build(at('2026-11-08T17:00:00Z'));
    assert.deepEqual([saved[0][0].snapshotDate, saved[0][0].weekStart, saved[1][0].snapshotDate, saved[1][0].weekStart], ['2026-11-08', '2026-11-02', '2026-11-09', '2026-11-09']);
  });
  tc('semester FA26', '[EP] build(now): durationMs', R('durationMs is a number >= 0 and equals header.durationMs'), 'Normal', async () => {
    const saved = buildWorld();
    const result = await Snapshot.build(at('2026-11-06T03:00:00Z'));
    assert.deepEqual([typeof result.durationMs, result.durationMs >= 0, result.durationMs === saved[0][0].durationMs], ['number', true, true]);
  });

  // ---------------------------------------------------------------- getCurrent edges
  method('LeaderboardService.getCurrent(viewer, query), extra edges');
  const currentWorld = (options: { mine?: unknown; overall?: unknown; total?: number } = {}) => {
    stub(SystemConfigService, 'getSemesters', () => [{ name: 'FA26', startDate: '2000-01-01', endDate: '2099-12-31' }]);
    const latest = stub(LeaderboardRepository, 'findLatest', () => ({ id: 'snap-1', generatedAt: at('2026-11-07T01:00:00Z') }));
    stub(LeaderboardRepository, 'countEntries', (_id: string, category: string) => (category === 'OVERALL' ? 40 : options.total ?? 25));
    const pages = stub(LeaderboardRepository, 'findPage', (_id: string, _category: string, skip: number) => (skip === 0 ? [entry(1, 'SV-1', 98), entry(2, 'SV-2', 95), entry(3, 'SV-3', 90)] : [entry(4, 'SV-9', 70)]));
    const entries = stub(LeaderboardRepository, 'findEntry', (_id: string, category: string) => (category === 'OVERALL' ? options.overall ?? null : options.mine ?? null));
    return { latest, pages, entries };
  };
  const student = { userId: 'SV-7', role: 1 };
  tc('FA26 snapshot exists; current semester also FA26', '[EP] getCurrent(student, { semester: "SP27" })', R('findCurrentSemester is not called; findLatest("SP27") is used; dto.semester.name "SP27"'), 'Normal', async () => {
    const { latest } = currentWorld();
    const finds = stub(Snapshot, 'findCurrentSemester');
    const dto = await LeaderboardService.getCurrent(student, query({ semester: 'SP27' }));
    assert.deepEqual([finds.length, latest[0][0], dto.semester.name], [0, 'SP27', 'SP27']);
  });
  tc('snapshot has 3 top rows + pages', '[BVA] getCurrent(student, page 1, limit 50) / (page 3, limit 10)', R('page query skips 3 rows (top 3) / 23 rows: skip = 3 + (page - 1) x limit'), 'Boundary', async () => {
    const { pages } = currentWorld();
    await LeaderboardService.getCurrent(student, query({ page: 1, limit: 50 }));
    await LeaderboardService.getCurrent(student, query({ page: 3, limit: 10 }));
    const skips = pages.map((call) => call[2]).filter((skip) => skip !== 0);
    assert.deepEqual(skips, [3, 23]);
  });
  tc('snapshot exists', '[BVA] getCurrent(student, limit 1) / (limit 100)', R('findPage take = 1 / 100 (limit passed through)'), 'Boundary', async () => {
    const { pages } = currentWorld();
    await LeaderboardService.getCurrent(student, query({ limit: 1 }));
    await LeaderboardService.getCurrent(student, query({ limit: 100 }));
    assert.deepEqual(pages.map((call) => call[3]).filter((take) => take !== 3), [1, 100]);
  });
  tc('countEntries(category) = 3 / 4', '[BVA] getCurrent(student, category "accuracy") with 3 rows / 4 rows in the tab', R('pagination.total 0 / 1 (rows after the top 3, never negative)'), 'Boundary', async () => {
    currentWorld({ total: 3 });
    const three = (await LeaderboardService.getCurrent(student, query({ category: 'accuracy' }))).pagination.total;
    currentWorld({ total: 4 });
    const four = (await LeaderboardService.getCurrent(student, query({ category: 'accuracy' }))).pagination.total;
    assert.deepEqual([three, four], [0, 1]);
  });

}
