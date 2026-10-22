import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Student progress (lecturer + own student view)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let lecturerToken: string;
  let classRecord: Awaited<ReturnType<typeof TestDatabase.createClass>>;

  beforeEach(async () => {
    await TestDatabase.reset();
    lecturer = await TestDatabase.createLecturer();
    lecturerToken = TestDatabase.tokenFor(lecturer);
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    classRecord = await TestDatabase.createClass(lecturer.id, tranh.id, { name: 'TRD301', startDate: TestDatabase.futureDate(-20) });
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const get = (path: string, token: string = lecturerToken) => request(app).get(`/api/v1/classes/${classRecord.id}${path}`).set('Authorization', token);
  const daysAgo = (days: number, hourUtc = 3) => {
    const date = new Date(Date.now() - days * 86400000);
    date.setUTCHours(hourUtc, 0, 0, 0);
    return date;
  };

  async function member(name: string, code: string) {
    const student = await TestDatabase.createUser({ username: name, studentCode: code });
    await TestDatabase.addMember(classRecord.id, student.id, lecturer.id);
    return student;
  }

  it('counts and statuses for the class', async () => {
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'SOLO' });
    const good = await member('An Giỏi', 'SE1');
    const middle = await member('Bình Trung', 'SE2');
    const weak = await member('Cường Yếu', 'SE3');
    await member('Dung Chưa Nộp', 'SE4');
    await TestDatabase.createSubmission(solo.id, good.id, { accuracy: 80 });
    await TestDatabase.createSubmission(solo.id, middle.id, { accuracy: 50 });
    await TestDatabase.createSubmission(solo.id, weak.id, { accuracy: 20 });

    const response = await get('/progress');
    expect(response.status).toBe(200);
    expect(response.body.data.counts).toEqual({ ON_TRACK: 1, AT_RISK: 1, BEHIND: 1, NO_DATA: 1 });
    expect(response.body.data.students.map((student: { fullName: string; status: string | null }) => [student.fullName, student.status])).toEqual([
      ['An Giỏi', 'ON_TRACK'],
      ['Bình Trung', 'AT_RISK'],
      ['Cường Yếu', 'BEHIND'],
      ['Dung Chưa Nộp', null]
    ]);
    expect(response.body.data.students[0]).toMatchObject({ studentCode: 'SE1', average: 80, assignmentsWithSubmissions: 1 });
    expect(response.body.data.students[3]).toMatchObject({ average: null, assignmentsWithSubmissions: 0, lastSubmittedAt: null });
  });

  it('excludes bonus, deleted and draft assignments but includes closed ones', async () => {
    const student = await member('An', 'SE1');
    const closed = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'ENSEMBLE', status: 'CLOSED' });
    const bonus = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'BONUS' });
    const deleted = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { deletedAt: new Date() });
    const draft = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { status: 'DRAFT' });
    await TestDatabase.createSubmission(closed.id, student.id, { accuracy: 60 });
    for (const assignment of [bonus, deleted, draft]) await TestDatabase.createSubmission(assignment.id, student.id, { accuracy: 100 });

    const row = (await get('/progress')).body.data.students[0];
    expect(row).toMatchObject({ average: 60, status: 'AT_RISK', assignmentsWithSubmissions: 1 });
  });

  it('bonus-only and rejected-only students have no status', async () => {
    const bonus = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'BONUS' });
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const bonusOnly = await member('An', 'SE1');
    const rejectedOnly = await member('Bình', 'SE2');
    await TestDatabase.createSubmission(bonus.id, bonusOnly.id, { accuracy: 90 });
    await TestDatabase.createSubmission(solo.id, rejectedOnly.id, { status: 'REJECTED' });

    const progress = (await get('/progress')).body.data;
    expect(progress.counts.NO_DATA).toBe(2);
    expect(progress.students.every((student: { status: string | null }) => student.status === null)).toBe(true);
    const summary = (await get(`/students/${bonusOnly.id}/summary`)).body.data;
    expect(summary).toMatchObject({ status: null, average: null, totalSessions: 1 });
    expect((await get(`/students/${rejectedOnly.id}/summary`)).body.data.totalSessions).toBe(1);
  });

  it('removed student is not listed but the lecturer can open their summary and history', async () => {
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const removed = await TestDatabase.createUser({ username: 'Đã rời', studentCode: 'SE9' });
    const membership = await TestDatabase.addMember(classRecord.id, removed.id, lecturer.id);
    await TestDatabase.createSubmission(solo.id, removed.id, { accuracy: 75 });
    await TestDatabase.prisma.classMember.update({ where: { id: membership.id }, data: { removedAt: new Date() } });

    expect((await get('/progress')).body.data.students).toEqual([]);
    expect((await get(`/students/${removed.id}/summary`)).body.data).toMatchObject({ average: 75, student: { fullName: 'Đã rời', studentCode: 'SE9' } });
    expect((await get(`/students/${removed.id}/history`)).body.data.items).toHaveLength(1);
    const stranger = await TestDatabase.createUser();
    expect((await get(`/students/${stranger.id}/summary`)).status).toBe(404);
  });

  it('status and minAccuracy follow settings', async () => {
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const student = await member('An', 'SE1');
    await TestDatabase.createSubmission(solo.id, student.id, { accuracy: 65 });
    expect((await get('/progress')).body.data.students[0].status).toBe('AT_RISK');
    await TestDatabase.resetGradingSettings(60, 30);
    expect((await get('/progress')).body.data.students[0].status).toBe('ON_TRACK');
    expect((await get(`/students/${student.id}/summary`)).body.data).toMatchObject({ status: 'ON_TRACK', minAccuracy: 60 });
  });

  it('summary totals, last 7 days and weekly', async () => {
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const bonus = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'BONUS' });
    const student = await member('An', 'SE1');
    await TestDatabase.createSubmission(solo.id, student.id, { accuracy: 40, submittedAt: daysAgo(19) }); // W1
    await TestDatabase.createSubmission(solo.id, student.id, { accuracy: 60, submittedAt: daysAgo(18) }); // W1
    await TestDatabase.createSubmission(solo.id, student.id, { accuracy: 90, submittedAt: daysAgo(5) }); // W3
    await TestDatabase.createSubmission(solo.id, student.id, { status: 'FAILED', submittedAt: daysAgo(10) });
    await TestDatabase.createSubmission(bonus.id, student.id, { accuracy: 10, submittedAt: daysAgo(2) });

    const summary = (await get(`/students/${student.id}/summary`)).body.data;
    expect(summary).toMatchObject({
      average: 90,
      status: 'ON_TRACK',
      minAccuracy: 70,
      totalSessions: 5,
      sessionsLast7Days: 2,
      class: { id: classRecord.id, name: 'TRD301', cohort: 'FA26', instrument: { name: 'Đàn tranh' }, startDate: TestDatabase.futureDate(-20) }
    });
    expect(summary.weekly).toHaveLength(6);
    expect(summary.weekly.map((week: { average: number | null }) => week.average)).toEqual([50, null, 90, null, null, null]);
  });

  it('history newest first with pagination', async () => {
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { title: 'Độc tấu' });
    const student = await member('An', 'SE1');
    for (const days of [3, 2, 1]) await TestDatabase.createSubmission(solo.id, student.id, { accuracy: 50 + days, submittedAt: daysAgo(days) });
    const page = (await get(`/students/${student.id}/history?page=1&limit=2`)).body.data;
    expect(page.pagination).toEqual({ page: 1, limit: 2, total: 3 });
    expect(page.items.map((item: { accuracy: number }) => item.accuracy)).toEqual([51, 52]);
    expect(page.items[0]).toMatchObject({ assignmentId: solo.id, assignmentTitle: 'Độc tấu', kind: 'SOLO', status: 'COMPLETED' });
  });

  it('history date filter is inclusive in UTC+7', async () => {
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const student = await member('An', 'SE1');
    await TestDatabase.createSubmission(solo.id, student.id, { submittedAt: new Date('2026-10-09T17:30:00Z') }); // 10/10 00:30 VN
    await TestDatabase.createSubmission(solo.id, student.id, { submittedAt: new Date('2026-10-12T16:59:00Z') }); // 12/10 23:59 VN
    await TestDatabase.createSubmission(solo.id, student.id, { submittedAt: new Date('2026-10-12T17:01:00Z') }); // 13/10 VN
    const count = async (query: string) => (await get(`/students/${student.id}/history?${query}`)).body.data.items.length;
    expect(await count('from=2026-10-10&to=2026-10-12')).toBe(2);
    expect(await count('from=2026-10-13')).toBe(1);
    expect(await count('to=2026-10-09')).toBe(0);
    expect(await count('to=2026-10-10')).toBe(1);
  });

  it('from after to returns MSG-04', async () => {
    const student = await member('An', 'SE1');
    const response = await get(`/students/${student.id}/history?from=2026-10-20&to=2026-10-10`);
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([{ field: 'from', code: 'MSG-04', message: 'Từ ngày không được sau đến ngày.' }]);
  });

  it('permissions', async () => {
    const student = await member('An', 'SE1');
    const other = await member('Bình', 'SE2');
    const studentToken = TestDatabase.tokenFor(student);
    const otherLecturerToken = TestDatabase.tokenFor(await TestDatabase.createLecturer());
    for (const path of ['/progress', `/students/${student.id}/summary`, `/students/${student.id}/history`]) {
      expect((await get(path, otherLecturerToken)).status).toBe(404);
    }
    expect((await get(`/students/${student.id}/summary`, studentToken)).status).toBe(200);
    expect((await get(`/students/${student.id}/history`, studentToken)).status).toBe(200);
    expect((await get('/progress', studentToken)).status).toBe(403);
    expect((await get(`/students/${other.id}/summary`, studentToken)).status).toBe(404);
    const adminToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: 3 }));
    expect((await get(`/students/${student.id}/summary`, adminToken)).status).toBe(403);
  });
});
