import { test } from 'node:test';
import assert from 'node:assert/strict';
import StudentDashboardService from './StudentDashboardService.ts';
import type PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';

// 2026-10-22 10:00 UTC+7
const now = new Date('2026-10-22T03:00:00Z');

function row(overrides: Partial<Practice.DashboardRecord>): Practice.DashboardRecord {
  return {
    assignmentId: null, status: 'COMPLETED', practiceMode: 'SOLO', accuracy: 80,
    createdAt: new Date('2026-10-22T02:00:00Z'), assignment: null, ...overrides
  };
}

function setup(rows: Practice.DashboardRecord[]) {
  const repository = { findDashboardRows: async () => rows } as unknown as PracticeSubmissionRepository;
  return new StudentDashboardService(repository);
}

const lyNguaO = { title: 'Lý ngựa ô', deletedAt: null };
const trongCom = { title: 'Trống cơm', deletedAt: null };

test('Chưa nộp bài nào: số liệu rỗng, không có bài nổi bật', async () => {
  const dashboard = await setup([]).get('student', now);
  assert.equal(dashboard.totalSubmissions, 0);
  assert.deepEqual(dashboard.today, { submitted: 0, completed: 0, bestAccuracy: null, averageAccuracy: null });
  assert.equal(dashboard.recentDays.length, 7);
  assert.equal(dashboard.mostSubmittedAssignment, null);
  assert.equal(dashboard.mostImprovedAssignment, null);
  assert.deepEqual(dashboard.solo, { completed: 0, points: [], latestAccuracy: null, averageAccuracy: null, deltaPercent: null });
});

test('Hôm nay tính theo ngày Việt Nam; độ chính xác chỉ lấy bài đã phân tích', async () => {
  const dashboard = await setup([
    // 23:30 UTC ngày 21 = 06:30 ngày 22 giờ Việt Nam
    row({ accuracy: 70, createdAt: new Date('2026-10-21T23:30:00Z') }),
    row({ accuracy: 90 }),
    row({ status: 'PROCESSING', accuracy: null }),
    // 16:00 UTC ngày 21 = 23:00 ngày 21 giờ Việt Nam
    row({ accuracy: 50, createdAt: new Date('2026-10-21T16:00:00Z') })
  ]).get('student', now);
  assert.deepEqual(dashboard.today, { submitted: 3, completed: 2, bestAccuracy: 90, averageAccuracy: 80 });
  assert.deepEqual(dashboard.recentDays.slice(-2), [
    { date: '2026-10-21', submitted: 1, averageAccuracy: 50 },
    { date: '2026-10-22', submitted: 3, averageAccuracy: 80 }
  ]);
  assert.equal(dashboard.recentDays[0].date, '2026-10-16');
});

test('Bài nộp nhiều nhất và bài tiến bộ nhiều nhất; bỏ qua bài tập đã xóa', async () => {
  const dashboard = await setup([
    row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 60 }),
    row({ assignmentId: 'a1', assignment: lyNguaO, status: 'REJECTED', accuracy: null }),
    row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 65 }),
    row({ assignmentId: 'a2', assignment: trongCom, accuracy: 50 }),
    row({ assignmentId: 'a2', assignment: trongCom, accuracy: 72.46 }),
    row({ assignmentId: 'a3', assignment: { title: 'Đã xóa', deletedAt: new Date() }, accuracy: 10 }),
    row({ assignmentId: 'a3', assignment: { title: 'Đã xóa', deletedAt: new Date() }, accuracy: 99 }),
    row({ assignmentId: 'a3', assignment: { title: 'Đã xóa', deletedAt: new Date() }, accuracy: 99 }),
    row({ assignmentId: 'a3', assignment: { title: 'Đã xóa', deletedAt: new Date() }, accuracy: 99 })
  ]).get('student', now);
  assert.deepEqual(dashboard.mostSubmittedAssignment, {
    assignmentId: 'a1', title: 'Lý ngựa ô', submissionCount: 3, firstAccuracy: 60, latestAccuracy: 65, deltaPercent: 5
  });
  assert.deepEqual(dashboard.mostImprovedAssignment, {
    assignmentId: 'a2', title: 'Trống cơm', submissionCount: 2, firstAccuracy: 50, latestAccuracy: 72.5, deltaPercent: 22.5
  });
});

test('Không bài nào có điểm tăng thì không có bài tiến bộ nhất', async () => {
  const dashboard = await setup([
    row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 80 }),
    row({ assignmentId: 'a1', assignment: lyNguaO, accuracy: 75 })
  ]).get('student', now);
  assert.equal(dashboard.mostImprovedAssignment, null);
});

test('Tiến bộ độc tấu và hòa tấu tách riêng, giữ 10 lần phân tích gần nhất', async () => {
  const soloRows = Array.from({ length: 12 }, (_, index) => row({
    accuracy: 50 + index * 2, createdAt: new Date(Date.UTC(2026, 9, 10 + index))
  }));
  const dashboard = await setup([
    ...soloRows,
    row({ practiceMode: 'ENSEMBLE', accuracy: 70 }),
    row({ practiceMode: 'ENSEMBLE', status: 'FAILED', accuracy: null })
  ]).get('student', now);
  assert.equal(dashboard.solo.completed, 12);
  assert.equal(dashboard.solo.points.length, 10);
  assert.equal(dashboard.solo.points[0].accuracy, 54);
  assert.equal(dashboard.solo.latestAccuracy, 72);
  assert.equal(dashboard.solo.deltaPercent, 18);
  assert.deepEqual(
    { ...dashboard.ensemble, points: dashboard.ensemble.points.length },
    { completed: 1, points: 1, latestAccuracy: 70, averageAccuracy: 70, deltaPercent: null }
  );
});
