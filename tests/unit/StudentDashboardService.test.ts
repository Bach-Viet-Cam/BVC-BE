/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial records; services are called through a loose handle */
// Report 5.1 unit tests of one service (every row of the workbook tab), run with: npx tsx --test tests/unit/StudentDashboardService.test.ts
// Test names start with the Test Case ID of the workbook row (UTC-xx-nnn).
import assert from 'node:assert/strict';
import UnitTestKit from './support/UnitCases.ts';
import StudentDashboardServiceClass from '../../src/modules/practice/service/StudentDashboardService.ts';

// ----------------------------------------------------------------------
// Part 1: first rows of the tab
// ----------------------------------------------------------------------
{

  const { R, method, sheet, tc } = UnitTestKit;
  const StudentDashboardService: any = StudentDashboardServiceClass;

  sheet('StudentDashboardService', 'SD', 'src/modules/practice/service/StudentDashboardServiceReport.test.ts');
  const SRC = 'src/modules/practice/service/StudentDashboardService.test.ts';
  const now = new Date('2026-10-22T03:00:00Z'); // 2026-10-22 10:00 UTC+7
  const row = (overrides: Record<string, unknown> = {}) => ({ assignmentId: null, status: 'COMPLETED', practiceMode: 'SOLO', accuracy: 80, createdAt: new Date('2026-10-22T02:00:00Z'), assignment: null, ...overrides });
  const service = (rows: unknown[]) => {
    const calls: string[] = [];
    return { calls, dashboard: new StudentDashboardService({ findDashboardRows: async (studentId: string) => { calls.push(studentId); return rows; } }) };
  };
  const lyNguaO = { title: 'Lý ngựa ô', deletedAt: null };
  const trongCom = { title: 'Trống cơm', deletedAt: null };
  const repoPre = (rows: string) => `repository.findDashboardRows stubbed → ${rows}; now=2026-10-22T03:00:00Z (10:00 UTC+7)`;

  method('isScored(row)');
  tc('N/A', 'row={ status: "COMPLETED", accuracy: 80 }', R('true'), 'Normal', () => assert.equal(StudentDashboardService.isScored(row()), true));
  tc('N/A', 'row={ status: "COMPLETED", accuracy: null }', R('false'), 'Abnormal', () => assert.equal(StudentDashboardService.isScored(row({ accuracy: null })), false));
  tc('N/A', 'row={ status: "PROCESSING", accuracy: 80 }', R('false (not analysed yet)'), 'Abnormal', () => assert.equal(StudentDashboardService.isScored(row({ status: 'PROCESSING' })), false));
  tc('N/A', 'row={ status: "COMPLETED", accuracy: 0 }', R('true (0 % is still a score)'), 'Boundary', () => assert.equal(StudentDashboardService.isScored(row({ accuracy: 0 })), true));
  method('round(value)');
  tc('N/A', 'value=72.46', R('72.5'), 'Normal', () => assert.equal(StudentDashboardService.round(72.46), 72.5));
  tc('N/A', 'value=72.44', R('72.4'), 'Boundary', () => assert.equal(StudentDashboardService.round(72.44), 72.4));
  method('average(values)');
  tc('N/A', 'values=[70, 90]', R('80'), 'Normal', () => assert.equal(StudentDashboardService.average([70, 90]), 80));
  tc('N/A', 'values=[33.33, 33.33, 33.34]', R('33.3 (1 decimal)'), 'Normal', () => assert.equal(StudentDashboardService.average([33.33, 33.33, 33.34]), 33.3));
  tc('N/A', 'values=[]', R('null'), 'Boundary', () => assert.equal(StudentDashboardService.average([]), null));
  method('delta(values)');
  tc('N/A', 'values=[50, 72.46]', R('22.5 (latest − first)'), 'Normal', () => assert.equal(StudentDashboardService.delta([50, 72.46]), 22.5));
  tc('N/A', 'values=[80, 75]', R('-5'), 'Normal', () => assert.equal(StudentDashboardService.delta([80, 75]), -5));
  tc('N/A', 'values=[80]', R('null (needs 2 values)'), 'Boundary', () => assert.equal(StudentDashboardService.delta([80]), null));
  method('get(studentId, now)');
  tc(repoPre('[]'), 'studentId="SV-1"', R('{ totalSubmissions: 0, today: { submitted: 0, completed: 0, bestAccuracy: null, averageAccuracy: null }, recentDays: 7 items, mostSubmittedAssignment: null, mostImprovedAssignment: null, solo: { completed: 0, points: [], latestAccuracy: null, averageAccuracy: null, deltaPercent: null } }', 'findDashboardRows called once with "SV-1"'), 'Boundary', async () => {
    const { calls, dashboard } = service([]); const result = await dashboard.get('SV-1', now);
    assert.equal(result.totalSubmissions, 0); assert.deepEqual(result.today, { submitted: 0, completed: 0, bestAccuracy: null, averageAccuracy: null }); assert.equal(result.recentDays.length, 7);
    assert.deepEqual([result.mostSubmittedAssignment, result.mostImprovedAssignment], [null, null]);
    assert.deepEqual(result.solo, { completed: 0, points: [], latestAccuracy: null, averageAccuracy: null, deltaPercent: null }); assert.deepEqual(calls, ['SV-1']);
  }, `${SRC} › Chưa nộp bài nào: số liệu rỗng, không có bài nổi bật`);
  tc(repoPre('4 rows: 70 % at 2026-10-21T23:30Z (06:30 on the 22nd UTC+7), 90 %, 1 PROCESSING, 50 % at 2026-10-21T16:00Z (23:00 on the 21st)'), 'studentId="SV-1"',
    R('today={ submitted: 3, completed: 2, bestAccuracy: 90, averageAccuracy: 80 }; recentDays[-2..] = [{ date: "2026-10-21", submitted: 1, averageAccuracy: 50 }, { date: "2026-10-22", submitted: 3, averageAccuracy: 80 }]; recentDays[0].date="2026-10-16"'), 'Normal', async () => {
      const { dashboard } = service([row({ accuracy: 70, createdAt: new Date('2026-10-21T23:30:00Z') }), row({ accuracy: 90 }), row({ status: 'PROCESSING', accuracy: null }), row({ accuracy: 50, createdAt: new Date('2026-10-21T16:00:00Z') })]);
      const result = await dashboard.get('SV-1', now);
      assert.deepEqual(result.today, { submitted: 3, completed: 2, bestAccuracy: 90, averageAccuracy: 80 });
      assert.deepEqual(result.recentDays.slice(-2), [{ date: '2026-10-21', submitted: 1, averageAccuracy: 50 }, { date: '2026-10-22', submitted: 3, averageAccuracy: 80 }]); assert.equal(result.recentDays[0].date, '2026-10-16');
    }, `${SRC} › Hôm nay tính theo ngày Việt Nam; độ chính xác chỉ lấy bài đã phân tích`);
  tc(repoPre('2 rows: 60 % at 2026-10-21T17:00:00Z (00:00 on the 22nd UTC+7) and 40 % at 2026-10-21T16:59:59Z (23:59:59 on the 21st)'), 'studentId="SV-1"',
    R('today={ submitted: 1, completed: 1, bestAccuracy: 60 }; recentDays "2026-10-21" has submitted 1 (day boundary is 00:00 UTC+7)'), 'Boundary', async () => {
      const { dashboard } = service([row({ accuracy: 60, createdAt: new Date('2026-10-21T17:00:00Z') }), row({ accuracy: 40, createdAt: new Date('2026-10-21T16:59:59Z') })]);
      const result = await dashboard.get('SV-1', now);
      assert.deepEqual([result.today.submitted, result.today.bestAccuracy, result.recentDays[5].date, result.recentDays[5].submitted], [1, 60, '2026-10-21', 1]);
    });
  tc(repoPre('2 rows: 2026-10-16T05:00Z (first day of the window) and 2026-10-15T05:00Z (8 days ago)'), 'studentId="SV-1"',
    R('totalSubmissions=2; recentDays[0]={ date: "2026-10-16", submitted: 1 }; the 2026-10-15 row is outside recentDays'), 'Boundary', async () => {
      const { dashboard } = service([row({ createdAt: new Date('2026-10-16T05:00:00Z') }), row({ createdAt: new Date('2026-10-15T05:00:00Z') })]);
      const result = await dashboard.get('SV-1', now);
      assert.deepEqual([result.totalSubmissions, result.recentDays[0].submitted, result.recentDays.reduce((sum: number, day: any) => sum + day.submitted, 0)], [2, 1, 1]);
    });
  tc(repoPre('a1 "Lý ngựa ô": 60 %, REJECTED, 65 %; a2 "Trống cơm": 50 %, 72.46 %; a3 (deleted assignment): 4 rows'), 'studentId="SV-1"',
    R('mostSubmittedAssignment={ assignmentId: "a1", title: "Lý ngựa ô", submissionCount: 3, firstAccuracy: 60, latestAccuracy: 65, deltaPercent: 5 }; mostImprovedAssignment={ assignmentId: "a2", title: "Trống cơm", submissionCount: 2, firstAccuracy: 50, latestAccuracy: 72.5, deltaPercent: 22.5 }'), 'Normal', async () => {
      const deleted = { title: 'Đã xóa', deletedAt: new Date() };
      const { dashboard } = service([
        row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 60 }), row({ assignmentId: 'a1', assignment: lyNguaO, status: 'REJECTED', accuracy: null }), row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 65 }),
        row({ assignmentId: 'a2', assignment: trongCom, accuracy: 50 }), row({ assignmentId: 'a2', assignment: trongCom, accuracy: 72.46 }),
        ...Array.from({ length: 4 }, (_, index) => row({ assignmentId: 'a3', assignment: deleted, accuracy: index ? 99 : 10 }))
      ]);
      const result = await dashboard.get('SV-1', now);
      assert.deepEqual(result.mostSubmittedAssignment, { assignmentId: 'a1', title: 'Lý ngựa ô', submissionCount: 3, firstAccuracy: 60, latestAccuracy: 65, deltaPercent: 5 });
      assert.deepEqual(result.mostImprovedAssignment, { assignmentId: 'a2', title: 'Trống cơm', submissionCount: 2, firstAccuracy: 50, latestAccuracy: 72.5, deltaPercent: 22.5 });
    }, `${SRC} › Bài nộp nhiều nhất và bài tiến bộ nhiều nhất; bỏ qua bài tập đã xóa`);
  tc(repoPre('a1 "Lý ngựa ô": 80 %, then 75 %'), 'studentId="SV-1"', R('mostImprovedAssignment=null (accuracy did not rise)'), 'Abnormal', async () => {
    const { dashboard } = service([row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 80 }), row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 75 })]);
    assert.equal((await dashboard.get('SV-1', now)).mostImprovedAssignment, null);
  }, `${SRC} › Không bài nào có điểm tăng thì không có bài tiến bộ nhất`);
  tc(repoPre('a1 "Lý ngựa ô": 2 rows; a2 "Trống cơm": 2 rows (tie)'), 'studentId="SV-1"', R('mostSubmittedAssignment.assignmentId="a1" (first one keeps the tie)'), 'Boundary', async () => {
    const { dashboard } = service([row({ assignmentId: 'a1', assignment: lyNguaO }), row({ assignmentId: 'a2', assignment: trongCom }), row({ assignmentId: 'a1', assignment: lyNguaO }), row({ assignmentId: 'a2', assignment: trongCom })]);
    assert.equal((await dashboard.get('SV-1', now)).mostSubmittedAssignment.assignmentId, 'a1');
  });
  tc(repoPre('12 SOLO rows 50 %, 52 % … 72 % (one per day from 2026-10-10), 1 ENSEMBLE 70 %, 1 ENSEMBLE FAILED'), 'studentId="SV-1"',
    R('solo={ completed: 12, points: 10 items (54 % … 72 %), latestAccuracy: 72, deltaPercent: 18 }; ensemble={ completed: 1, points: 1, latestAccuracy: 70, averageAccuracy: 70, deltaPercent: null }'), 'Normal', async () => {
      const soloRows = Array.from({ length: 12 }, (_, index) => row({ accuracy: 50 + index * 2, createdAt: new Date(Date.UTC(2026, 9, 10 + index)) }));
      const { dashboard } = service([...soloRows, row({ practiceMode: 'ENSEMBLE', accuracy: 70 }), row({ practiceMode: 'ENSEMBLE', status: 'FAILED', accuracy: null })]);
      const result = await dashboard.get('SV-1', now);
      assert.deepEqual([result.solo.completed, result.solo.points.length, result.solo.points[0].accuracy, result.solo.latestAccuracy, result.solo.deltaPercent], [12, 10, 54, 72, 18]);
      assert.deepEqual({ ...result.ensemble, points: result.ensemble.points.length }, { completed: 1, points: 1, latestAccuracy: 70, averageAccuracy: 70, deltaPercent: null });
    }, `${SRC} › Tiến bộ độc tấu và hòa tấu tách riêng, giữ 10 lần phân tích gần nhất`);
  tc(repoPre('1 row of assignment a1 whose assignment record is null (assignment removed)'), 'studentId="SV-1"', R('mostSubmittedAssignment=null; totalSubmissions=1 (row still counted)'), 'Abnormal', async () => {
    const { dashboard } = service([row({ assignmentId: 'a1', assignment: null })]); const result = await dashboard.get('SV-1', now);
    assert.deepEqual([result.mostSubmittedAssignment, result.totalSubmissions], [null, 1]);
  });

}
