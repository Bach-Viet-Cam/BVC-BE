import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LeaderboardSnapshotService from '../../src/modules/leaderboard/service/LeaderboardSnapshotService.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';
import F from './PracticeCommunityFixture.ts';
import TestDatabase from './TestDatabase.ts';

type TestUser = Awaited<ReturnType<typeof TestDatabase.createUser>>;
type Category = 'OVERALL' | 'ACCURACY' | 'IMPROVEMENT' | 'STREAK' | 'ACTIVITY';

const current = '/leaderboards/current';
const refresh = '/leaderboards/refresh';
const today = DateTimeUtil.todayInVietnam();

describe('Report 5.2 – Leaderboard (UC-17)', () => {
  let gvA: TestUser;
  let admin: TestUser;
  let classId: string;
  let assignmentId: string;

  beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await TestDatabase.reset();
    await TestDatabase.resetSemesters([
      { name: 'FA26', startDate: TestDatabase.futureDate(-30), endDate: TestDatabase.futureDate(30) },
      { name: 'SP27', startDate: TestDatabase.futureDate(60), endDate: TestDatabase.futureDate(150) }
    ]);
    gvA = await F.teacher('GV-A');
    admin = await F.admin();
    const instrument = await TestDatabase.createInstrument('Đàn tranh');
    classId = (await TestDatabase.createClass(gvA.id, instrument.id, { cohort: 'FA26', name: 'Lớp A' })).id;
    assignmentId = (await TestDatabase.createAssignment(classId, gvA.id, { kind: 'SOLO' })).id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await TestDatabase.prisma.$disconnect();
  });

  async function createStudents(count: number): Promise<TestUser[]> {
    const students: TestUser[] = [];
    for (let index = 1; index <= count; index += 1) {
      const student = await TestDatabase.createUser({ username: `SV ${index}`, studentCode: `SE${String(index).padStart(4, '0')}` });
      await TestDatabase.addMember(classId, student.id, gvA.id);
      students.push(student);
    }
    return students;
  }

  // Stored FA26 snapshot: students are ranked in the given order, per category
  async function createSnapshot(boards: Partial<Record<Category, TestUser[]>>, snapshotDate: string = today) {
    const now = new Date();
    return TestDatabase.prisma.leaderboardSnapshot.create({
      data: {
        semester: 'FA26',
        periodStart: DateTimeUtil.toDateOnly(TestDatabase.futureDate(-30)),
        periodEnd: DateTimeUtil.toDateOnly(TestDatabase.futureDate(30)),
        weekStart: DateTimeUtil.toDateOnly(DateTimeUtil.startOfWeekInVietnam(today)),
        snapshotDate: DateTimeUtil.toDateOnly(snapshotDate),
        startedAt: now, generatedAt: now, durationMs: 1,
        entries: {
          create: Object.entries(boards).flatMap(([category, students]) => students.map((student, index) => ({
            category: category as Category, studentId: student.id, classId, rank: index + 1, position: index + 1, value: 100 - index
          })))
        }
      }
    });
  }

  const board = (user: TestUser, query: string = '') => F.get(`${current}${query}`, user);
  const ranks = (rows: Array<{ rank: number }>) => rows.map((row) => row.rank);

  describe('View the leaderboard (GET /api/v1/leaderboards/current)', () => {
    it("ITC-LD-001 default overall board and the student's own position", async () => {
      const students = await createStudents(40);
      await createSnapshot({ OVERALL: students });

      const response = await board(students[11]);
      expect(response.status).toBe(200);
      expect(response.body.data.semester).toEqual({ name: 'FA26', label: 'Học kỳ Thu 2026' });
      expect(response.body.data.top3).toHaveLength(3);
      expect(response.body.data.items[0].rank).toBe(4);
      expect(response.body.data.me).toMatchObject({ status: 'RANKED', rank: 12 });
      expect(response.body.data.pagination.total).toBe(37);
    });

    it('ITC-LD-002 improvement category when the student has no previous week; unknown category', async () => {
      const [first, sv2] = await createStudents(2);
      await createSnapshot({ OVERALL: [first, sv2], IMPROVEMENT: [first] });

      const improvement = await board(sv2, '?category=improvement');
      expect(improvement.status).toBe(200);
      expect(improvement.body.data.me).toEqual({ status: 'NOT_IN_CATEGORY', reason: 'NO_PREVIOUS_WEEK' });

      const unknown = await board(sv2, '?category=points');
      F.expectValidationError(unknown, 'category');
      expect(unknown.body.errors[0].message).toBe('Hạng mục không hợp lệ.');
    });

    it('ITC-LD-003 a lecturer can read without "me"; a semester without a snapshot', async () => {
      await createSnapshot({ OVERALL: await createStudents(4) });

      const response = await board(gvA);
      expect(response.status).toBe(200);
      expect(response.body.data.me).toBeNull();

      const empty = await board(gvA, '?semester=SP27');
      expect(empty.status).toBe(200);
      expect(empty.body.data).toMatchObject({ generatedAt: null, top3: [], items: [], totalRanked: 0 });

      F.expectValidationError(await board(gvA, '?limit=101'), 'limit');
    });

    it('ITC-LD-004 a Guest cannot read it', async () => {
      F.expectUnauthorized(await F.get(current));
    });
  });

  describe('Refresh (POST /api/v1/leaderboards/refresh)', () => {
    it('ITC-LD-005 an Admin refresh creates a new snapshot', async () => {
      await createSnapshot({ OVERALL: await createStudents(2) }, DateTimeUtil.addDays(today, -1));
      const countSnapshots = () => TestDatabase.prisma.leaderboardSnapshot.count({ where: { semester: 'FA26' } });
      const before = await countSnapshots();

      const response = await F.post(refresh, {}, admin);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Đã làm mới bảng xếp hạng.');
      expect(typeof response.body.data.generatedAt).toBe('string');
      expect(await countSnapshots()).toBe(before + 1);
    });

    it('ITC-LD-006 a lecturer cannot refresh; outside a semester generatedAt is null', async () => {
      await TestDatabase.resetSemesters();
      F.expectForbidden(await F.post(refresh, {}, gvA));

      const response = await F.post(refresh, {}, admin);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ generatedAt: null });
    });
  });

  describe('More leaderboard checks (GET /leaderboards/current, POST /leaderboards/refresh)', () => {
    it('ITC-LD-007 a wrong category', async () => {
      const [sv1] = await createStudents(1);
      const response = await board(sv1, '?category=weekly');
      F.expectValidationError(response, 'category');
      expect(response.body.errors[0].message).toBe('Hạng mục không hợp lệ.');
    });

    it('ITC-LD-008 a wrong semester value', async () => {
      const [sv1] = await createStudents(1);
      for (const semester of ['', 'a'.repeat(51)]) {
        const response = await board(sv1, `?semester=${semester}`);
        F.expectValidationError(response, 'semester');
        expect(response.body.errors[0].message).toBe('Học kỳ không hợp lệ.');
      }
    });

    it('ITC-LD-009 the other categories are sorted highest first and ranks start at 1', async () => {
      const students = await createStudents(5);
      for (const [index, student] of students.entries()) {
        // Student n has n + 1 takes today and one take on each of the n previous days
        for (let take = 0; take <= index; take += 1) {
          await TestDatabase.createSubmission(assignmentId, student.id, { accuracy: 60 + index * 5, submittedAt: new Date() });
          await TestDatabase.createSubmission(assignmentId, student.id, {
            accuracy: 60 + index * 5, submittedAt: new Date(Date.now() - take * DateTimeUtil.dayInMilliseconds)
          });
        }
      }
      await LeaderboardSnapshotService.build();

      for (const category of ['accuracy', 'streak', 'activity']) {
        const response = await board(students[0], `?category=${category}`);
        expect(response.status, category).toBe(200);
        const rows = [...response.body.data.top3, ...response.body.data.items] as Array<{ rank: number; value: number }>;
        const values = rows.map((row) => row.value);
        expect(rows, category).toHaveLength(5);
        expect(values, category).toEqual([...values].sort((left, right) => right - left));
        expect(ranks(rows), category).toEqual([1, 2, 3, 4, 5]);
      }
    });

    it('ITC-LD-010 paging', async () => {
      const students = await createStudents(7);
      await createSnapshot({ OVERALL: students });

      const response = await board(students[0], '?limit=2&page=2');
      expect(response.status).toBe(200);
      expect(ranks(response.body.data.top3)).toEqual([1, 2, 3]);
      expect(ranks(response.body.data.items)).toEqual([6, 7]);
      F.expectValidationError(await board(students[0], '?page=0'), 'page');
    });

    it('ITC-LD-011 a student cannot refresh the board', async () => {
      const [sv1] = await createStudents(1);
      F.expectForbidden(await F.post(refresh, {}, sv1));
    });
  });
});
