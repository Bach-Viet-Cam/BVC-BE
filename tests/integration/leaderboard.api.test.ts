import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import LeaderboardSnapshotService from '../../src/modules/leaderboard/service/LeaderboardSnapshotService.ts';
import PlatformConstant from '../../src/modules/platform/constant/PlatformConstant.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const current = '/api/v1/leaderboards/current';
const refresh = '/api/v1/leaderboards/refresh';

describe('Leaderboard API (UC-17)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let classId: string;
  let assignmentId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const today = DateTimeUtil.todayInVietnam();
    const { group, valueType, label, description } = PlatformConstant.semesterConfig;
    const value = JSON.stringify([{ name: 'FA26', startDate: DateTimeUtil.addDays(today, -30), endDate: DateTimeUtil.addDays(today, 30) }]);
    await TestDatabase.prisma.systemConfig.upsert({
      where: { key: PlatformConstant.settingKeys.SEMESTERS },
      update: { value },
      create: { key: PlatformConstant.settingKeys.SEMESTERS, value, valueType, group, label, description }
    });
    lecturer = await TestDatabase.createLecturer();
    const instrument = await TestDatabase.createInstrument();
    classId = (await TestDatabase.createClass(lecturer.id, instrument.id, { cohort: 'FA26', name: 'Lớp A' })).id;
    assignmentId = (await TestDatabase.createAssignment(classId, lecturer.id, { kind: 'SOLO' })).id;
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  async function addStudent(code: string, accuracy: number | null) {
    const student = await TestDatabase.createUser({ studentCode: code, username: `SV ${code}` });
    await TestDatabase.addMember(classId, student.id, lecturer.id);
    if (accuracy !== null) await TestDatabase.createSubmission(assignmentId, student.id, { accuracy, submittedAt: new Date() });
    return student;
  }

  const get = (user: { id: string; email: string; username: string; role: number; status: Backend.UserStatus; studentCode?: string | null }, query: string = '') =>
    request(app).get(`${current}${query}`).set('Authorization', TestDatabase.tokenFor(user));

  it('rejects guests and accepts student, teacher and admin', async () => {
    const student = await addStudent('SE1', 80);
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    expect((await request(app).get(current)).status).toBe(401);
    expect((await request(app).post(refresh)).status).toBe(401);
    for (const viewer of [student, lecturer, admin]) expect((await get(viewer)).status).toBe(200);
  });

  it('refresh is admin only and the next read shows the new ranks', async () => {
    const student = await addStudent('SE1', 80);
    await addStudent('SE2', 60);
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });

    for (const viewer of [student, lecturer]) {
      const denied = await request(app).post(refresh).set('Authorization', TestDatabase.tokenFor(viewer));
      expect(denied.status).toBe(403);
    }
    const refreshed = await request(app).post(refresh).set('Authorization', TestDatabase.tokenFor(admin));
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.data.generatedAt).toBe('string');

    const response = await get(student, '?category=accuracy');
    expect(response.body.data.generatedAt).toBe(refreshed.body.data.generatedAt);
    expect(response.body.data.semester).toEqual({ name: 'FA26', label: 'Học kỳ Thu 2026' });
    expect(response.body.data.me).toEqual({ status: 'RANKED', rank: 1, value: 80 });
    expect(response.body.data.top3.map((row: { rank: number; fullName: string; className: string; value: number }) => [row.rank, row.fullName, row.className, row.value])).toEqual([
      [1, 'SV SE1', 'Lớp A', 80],
      [2, 'SV SE2', 'Lớp A', 60]
    ]);
    expect(response.body.data).toMatchObject({ totalRanked: 2, categoryTotal: 2, items: [], pagination: { page: 1, limit: 50, total: 0 } });
  });

  it('before the first refresh: empty answer with no generation time', async () => {
    const student = await addStudent('SE1', 80);
    const response = await get(student);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ generatedAt: null, totalRanked: 0, categoryTotal: 0, me: null, top3: [], items: [] });
  });

  it('semester without a snapshot is empty too', async () => {
    const student = await addStudent('SE1', 80);
    await LeaderboardSnapshotService.build();
    const response = await get(student, '?semester=SP26');
    expect(response.body.data).toMatchObject({ semester: { name: 'SP26', label: 'Học kỳ Xuân 2026' }, generatedAt: null, totalRanked: 0, top3: [] });
  });

  it('a student with no activity is NO_ACTIVITY while the list stays complete', async () => {
    await addStudent('SE1', 80);
    const idle = await addStudent('SE2', null);
    await LeaderboardSnapshotService.build();
    const response = await get(idle);
    expect(response.body.data.me).toEqual({ status: 'NO_ACTIVITY' });
    expect(response.body.data.top3).toHaveLength(1);
    expect(response.body.data.totalRanked).toBe(1);
  });

  it('improvement without last week data is NOT_IN_CATEGORY / NO_PREVIOUS_WEEK, other tabs NO_DATA', async () => {
    const student = await addStudent('SE1', 80);
    await LeaderboardSnapshotService.build();
    const improvement = await get(student, '?category=improvement');
    expect(improvement.body.data.me).toEqual({ status: 'NOT_IN_CATEGORY', reason: 'NO_PREVIOUS_WEEK' });
    expect(improvement.body.data).toMatchObject({ categoryTotal: 0, top3: [] });
    const unranked = await addStudent('SE2', null);
    await TestDatabase.createSubmission(assignmentId, unranked.id, { status: 'REJECTED', accuracy: null, submittedAt: new Date() });
    await LeaderboardSnapshotService.build();
    const accuracy = await get(unranked, '?category=accuracy');
    expect(accuracy.body.data.me).toEqual({ status: 'NOT_IN_CATEGORY', reason: 'NO_DATA' });
  });

  it('me is returned even when the viewer is not on the requested page', async () => {
    const accuracies = [90, 80, 70, 65, 60, 55, 50, 45];
    const students = [];
    for (const [index, accuracy] of accuracies.entries()) students.push(await addStudent(`SE${index + 1}`, accuracy));
    await LeaderboardSnapshotService.build();

    const page3 = await get(students[4], '?category=accuracy&limit=2&page=3');

    expect(page3.body.data.me).toEqual({ status: 'RANKED', rank: 5, value: 60 });
    expect(page3.body.data.top3.map((row: { rank: number }) => row.rank)).toEqual([1, 2, 3]);
    expect(page3.body.data.items.map((row: { rank: number }) => row.rank)).toEqual([8]);
    expect(page3.body.data.pagination).toEqual({ page: 3, limit: 2, total: 5 });
    const page1 = await get(students[4], '?category=accuracy&limit=2&page=1');
    expect(page1.body.data.items.map((row: { rank: number }) => row.rank)).toEqual([4, 5]);
  });

  it('only students get me', async () => {
    await addStudent('SE1', 80);
    await LeaderboardSnapshotService.build();
    const response = await get(lecturer);
    expect(response.body.data.me).toBeNull();
    expect(response.body.data.top3).toHaveLength(1);
  });

  it('validates category, paging and semester', async () => {
    const student = await addStudent('SE1', 80);
    for (const query of ['?category=bogus', '?page=0', '?limit=101', '?limit=abc', '?semester=']) {
      expect((await get(student, query)).status).toBe(400);
    }
  });
});
