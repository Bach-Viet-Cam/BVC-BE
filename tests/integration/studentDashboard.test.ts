import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';
import F from './PracticeCommunityFixture.ts';
import TestDatabase from './TestDatabase.ts';

type TestUser = Awaited<ReturnType<typeof TestDatabase.createUser>>;

// Day D is today in Vietnam; the clock is fixed at 10:00 (UTC+7) so day boundaries are stable
const dayD = DateTimeUtil.todayInVietnam();
const day = (offset: number): string => DateTimeUtil.addDays(dayD, offset);
const at = (date: string, time: string = '09:00:00'): Date => new Date(`${date}T${time}+07:00`);

describe('Report 5.2 – Student Dashboard', () => {
  let gvA: TestUser;
  let sv1: TestUser;
  let sv2: TestUser;
  let pieceId: string;
  let classId: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: at(dayD, '10:00:00') });
    await TestDatabase.reset();
    gvA = await F.teacher('GV-A');
    sv1 = await F.student('SV-1');
    sv2 = await F.student('SV-2');
    const instrument = await TestDatabase.createInstrument('Đàn tranh');
    pieceId = (await F.createSong(instrument.id, 'Bài 1')).id;
    classId = (await TestDatabase.createClass(gvA.id, instrument.id)).id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const dashboard = (user?: TestUser) => F.get('/practice/dashboard', user);
  const submit = (student: TestUser, data: Partial<Parameters<typeof F.createSubmission>[0]> = {}) =>
    F.createSubmission({ studentId: student.id, pieceId, createdAt: at(dayD), ...data });

  describe('Get the dashboard (GET /api/v1/practice/dashboard)', () => {
    it('ITC-SD-001 a student with takes today gets the right "Today" and 7-day figures', async () => {
      await submit(sv1, { status: 'COMPLETED', accuracy: 70 });
      await submit(sv1, { status: 'COMPLETED', accuracy: 90 });
      await submit(sv1, { status: 'PROCESSING' });

      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ totalSubmissions: 3, today: { submitted: 3, completed: 2, bestAccuracy: 90, averageAccuracy: 80 } });
      expect(response.body.data.recentDays).toHaveLength(7);
      expect(response.body.data.recentDays.at(-1)).toEqual({ date: dayD, submitted: 3, averageAccuracy: 80 });
    });

    it('ITC-SD-002 a student without any take gets empty figures', async () => {
      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        totalSubmissions: 0,
        today: { submitted: 0, completed: 0, bestAccuracy: null, averageAccuracy: null },
        mostSubmittedAssignment: null,
        mostImprovedAssignment: null
      });
      expect(response.body.data.solo).toEqual({ completed: 0, points: [], latestAccuracy: null, averageAccuracy: null, deltaPercent: null });
      expect(response.body.data.recentDays.map((item: { submitted: number }) => item.submitted)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('ITC-SD-003 a lecturer gets 403 and a Guest 401', async () => {
      F.expectForbiddenRole(await dashboard(gvA));
      F.expectUnauthorized(await dashboard());
    });

    it('ITC-SD-004 day boundary in Vietnam time: 00:00 counts as today, 23:59:59 of the previous day for yesterday', async () => {
      await submit(sv1, { accuracy: 60, createdAt: new Date(`${day(-1)}T17:00:00Z`) });
      await submit(sv1, { accuracy: 40, createdAt: new Date(`${day(-1)}T16:59:59Z`) });

      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      expect(response.body.data.today).toMatchObject({ submitted: 1, bestAccuracy: 60 });
      expect(response.body.data.recentDays[5]).toEqual({ date: day(-1), submitted: 1, averageAccuracy: 40 });
    });

    it('ITC-SD-005 7-day window: a take 6 days ago is in recentDays, one 7 days ago only counts in the total', async () => {
      await submit(sv1, { accuracy: 70, createdAt: at(day(-6)) });
      await submit(sv1, { accuracy: 50, createdAt: at(day(-7)) });

      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      expect(response.body.data.totalSubmissions).toBe(2);
      expect(response.body.data.recentDays[0]).toEqual({ date: day(-6), submitted: 1, averageAccuracy: 70 });
      const total = response.body.data.recentDays.reduce((sum: number, item: { submitted: number }) => sum + item.submitted, 0);
      expect(total).toBe(1);
    });

    it('ITC-SD-006 most submitted and most improved assignments; deleted assignments are ignored', async () => {
      const a1 = await TestDatabase.createAssignment(classId, gvA.id, { title: 'Lý ngựa ô' });
      const a2 = await TestDatabase.createAssignment(classId, gvA.id, { title: 'Trống cơm' });
      const a3 = await TestDatabase.createAssignment(classId, gvA.id, { title: 'Bài đã xóa', deletedAt: new Date() });
      const takes = [
        { assignmentId: a1.id, accuracy: 60 },
        { assignmentId: a1.id, status: 'REJECTED' as const, accuracy: null },
        { assignmentId: a1.id, accuracy: 65 },
        { assignmentId: a2.id, accuracy: 50 },
        { assignmentId: a2.id, accuracy: 72.46 },
        ...[10, 99, 99, 99].map((accuracy) => ({ assignmentId: a3.id, accuracy }))
      ];
      for (const [index, take] of takes.entries()) await submit(sv1, { ...take, createdAt: at(dayD, `08:00:${String(index).padStart(2, '0')}`) });

      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      expect(response.body.data.mostSubmittedAssignment).toEqual({
        assignmentId: a1.id, title: 'Lý ngựa ô', submissionCount: 3, firstAccuracy: 60, latestAccuracy: 65, deltaPercent: 5
      });
      expect(response.body.data.mostImprovedAssignment).toEqual({
        assignmentId: a2.id, title: 'Trống cơm', submissionCount: 2, firstAccuracy: 50, latestAccuracy: 72.5, deltaPercent: 22.5
      });
    });

    it('ITC-SD-007 there is no "most improved" when no assignment score rises', async () => {
      const a1 = await TestDatabase.createAssignment(classId, gvA.id);
      await submit(sv1, { assignmentId: a1.id, accuracy: 80, createdAt: at(dayD, '08:00:00') });
      await submit(sv1, { assignmentId: a1.id, accuracy: 75, createdAt: at(dayD, '08:30:00') });

      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      expect(response.body.data.mostImprovedAssignment).toBeNull();
      expect(response.body.data.mostSubmittedAssignment.deltaPercent).toBe(-5);
    });

    it('ITC-SD-008 solo / ensemble progress are separate and keep the last 10 analysed takes', async () => {
      const scores = Array.from({ length: 12 }, (_, index) => 50 + index * 2);
      for (const [index, accuracy] of scores.entries()) {
        await submit(sv1, { practiceMode: 'SOLO', accuracy, createdAt: at(day(index - 11)) });
      }
      await submit(sv1, { practiceMode: 'ENSEMBLE', accuracy: 70 });
      await submit(sv1, { practiceMode: 'ENSEMBLE', status: 'FAILED', accuracy: null });

      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      const { solo, ensemble } = response.body.data;
      expect(solo).toMatchObject({ completed: 12, latestAccuracy: 72, deltaPercent: 18 });
      expect(solo.points.map((point: { accuracy: number }) => point.accuracy)).toEqual(scores.slice(2));
      expect(ensemble).toMatchObject({ completed: 1, latestAccuracy: 70, averageAccuracy: 70, deltaPercent: null });
      expect(ensemble.points).toHaveLength(1);
    });

    it("ITC-SD-009 the dashboard only counts the signed-in student's own takes", async () => {
      await submit(sv1, { accuracy: 80 });
      for (let take = 0; take < 5; take += 1) await submit(sv2, { accuracy: 95 });

      const response = await dashboard(sv1);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ totalSubmissions: 1, today: { submitted: 1, bestAccuracy: 80 } });
    });

    it('ITC-SD-010 an Admin is also blocked from the student dashboard', async () => {
      F.expectForbiddenRole(await dashboard(await F.admin()));
    });
  });
});
