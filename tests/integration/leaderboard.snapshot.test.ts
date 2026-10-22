import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import LeaderboardRepository from '../../src/modules/leaderboard/repository/LeaderboardRepository.ts';
import LeaderboardScheduler from '../../src/modules/leaderboard/service/LeaderboardScheduler.ts';
import LeaderboardSnapshotService from '../../src/modules/leaderboard/service/LeaderboardSnapshotService.ts';
import PlatformConstant from '../../src/modules/platform/constant/PlatformConstant.ts';
import TestDatabase from './TestDatabase.ts';

const now = new Date('2026-10-22T03:00:00Z'); // Thursday 10:00 in Vietnam, week starts 2026-10-19
const at = (isoUtc: string): Date => new Date(isoUtc);

async function setSemesters(semesters: Backend.Semester[]): Promise<void> {
  const { group, valueType, label, description } = PlatformConstant.semesterConfig;
  const value = JSON.stringify(semesters);
  await TestDatabase.prisma.systemConfig.upsert({
    where: { key: PlatformConstant.settingKeys.SEMESTERS },
    update: { value },
    create: { key: PlatformConstant.settingKeys.SEMESTERS, value, valueType, group, label, description }
  });
}

async function readCategory(category: Backend.LeaderboardCategoryEnum) {
  const snapshot = await LeaderboardRepository.findLatest('FA26');
  if (!snapshot) throw new Error('no snapshot');
  return LeaderboardRepository.findPage(snapshot.id, category, 0, 100);
}

describe('Leaderboard snapshot job and scheduler (UC-17)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let classId: string;
  let instrumentId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    await setSemesters([{ name: 'FA26', startDate: '2026-09-07', endDate: '2026-12-27' }]);
    lecturer = await TestDatabase.createLecturer();
    instrumentId = (await TestDatabase.createInstrument()).id;
    classId = (await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26', name: 'Lớp A' })).id;
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  // Three active students and one idle student; the figures in the assertions were worked out by hand
  async function seedThreeStudents() {
    const [s1, s2, s3, s4] = await Promise.all(['SE1', 'SE2', 'SE3', 'SE4'].map((studentCode) => TestDatabase.createUser({ studentCode, username: `SV ${studentCode}` })));
    for (const student of [s1, s2, s3, s4]) await TestDatabase.addMember(classId, student.id, lecturer.id);
    const solo = await TestDatabase.createAssignment(classId, lecturer.id, { kind: 'SOLO' });
    const ensemble = await TestDatabase.createAssignment(classId, lecturer.id, { kind: 'ENSEMBLE' });
    const bonus = await TestDatabase.createAssignment(classId, lecturer.id, { kind: 'BONUS' });
    await TestDatabase.prisma.assignment.update({ where: { id: bonus.id }, data: { bonusPoints: 5 } });

    await TestDatabase.createSubmission(solo.id, s1.id, { accuracy: 60, submittedAt: at('2026-10-14T03:00:00Z') });
    await TestDatabase.createSubmission(solo.id, s1.id, { accuracy: 90, submittedAt: at('2026-10-20T03:00:00Z') });
    await TestDatabase.createSubmission(ensemble.id, s1.id, { accuracy: 80, submittedAt: at('2026-10-21T03:00:00Z') });
    await TestDatabase.createSubmission(bonus.id, s1.id, { accuracy: null, submittedAt: at('2026-10-21T04:00:00Z') });
    await TestDatabase.createSubmission(solo.id, s2.id, { accuracy: 70, submittedAt: at('2026-10-22T02:00:00Z') });
    await TestDatabase.createSubmission(solo.id, s3.id, { status: 'REJECTED', accuracy: null, submittedAt: at('2026-10-20T03:00:00Z') });
    return { s1, s2, s3, s4 };
  }

  it('computes ranks and scores for three students and skips the idle one', async () => {
    const { s1, s2, s3, s4 } = await seedThreeStudents();

    const result = await LeaderboardSnapshotService.build(now);

    expect(result?.semester).toBe('FA26');
    const overall = await readCategory('OVERALL');
    expect(overall.map((entry) => [entry.studentId, entry.rank, entry.value])).toEqual([[s1.id, 1, 100], [s2.id, 2, 12.5], [s3.id, 3, 0]]);
    expect(overall.map((entry) => entry.studentId)).not.toContain(s4.id);
    expect((await readCategory('ACCURACY')).map((entry) => [entry.studentId, entry.rank, entry.value])).toEqual([[s1.id, 1, 85], [s2.id, 2, 70]]);
    expect((await readCategory('IMPROVEMENT')).map((entry) => [entry.studentId, entry.rank, entry.value])).toEqual([[s1.id, 1, 25]]);
    expect((await readCategory('STREAK')).map((entry) => [entry.studentId, entry.rank, entry.value])).toEqual([[s1.id, 1, 2], [s2.id, 2, 1]]);
    expect((await readCategory('ACTIVITY')).map((entry) => [entry.studentId, entry.rank, entry.value])).toEqual([[s1.id, 1, 3], [s2.id, 2, 1], [s3.id, 3, 1]]);
  });

  it('stores raw and normalised criteria on the overall rows', async () => {
    const { s2 } = await seedThreeStudents();
    await LeaderboardSnapshotService.build(now);
    const snapshot = await LeaderboardRepository.findLatest('FA26');
    const entry = await TestDatabase.prisma.leaderboardEntry.findFirstOrThrow({ where: { snapshotId: snapshot?.id, category: 'OVERALL', studentId: s2.id } });
    expect(entry.criteria).toEqual({
      raw: { streak: 1, accuracy: 70, bonus: 0, completion: 50 },
      normalized: { streak: 0, accuracy: 0, bonus: 0, completion: 50 }
    });
  });

  it('rerun is idempotent and keeps the snapshot of earlier days', async () => {
    await seedThreeStudents();
    await LeaderboardSnapshotService.build(at('2026-10-21T03:00:00Z'));
    await LeaderboardSnapshotService.build(now);
    await LeaderboardSnapshotService.build(new Date(now.getTime() + 60_000));

    const snapshots = await TestDatabase.prisma.leaderboardSnapshot.findMany({ orderBy: { snapshotDate: 'asc' } });
    expect(snapshots.map((snapshot) => snapshot.snapshotDate.toISOString().slice(0, 10))).toEqual(['2026-10-21', '2026-10-22']);
    expect(await TestDatabase.prisma.leaderboardEntry.count({ where: { snapshotId: snapshots[1].id, category: 'OVERALL' } })).toBe(3);
    expect(snapshots[1].generatedAt.getTime()).toBe(now.getTime() + 60_000);
    expect(snapshots[1].periodStart.toISOString().slice(0, 10)).toBe('2026-09-07');
    expect(snapshots[1].weekStart.toISOString().slice(0, 10)).toBe('2026-10-19');
  });

  it('a failure inside the transaction leaves the previous snapshot of the day untouched', async () => {
    await seedThreeStudents();
    await LeaderboardSnapshotService.build(now);
    const before = await TestDatabase.prisma.leaderboardEntry.count();
    const header: Backend.LeaderboardSnapshotHeader = {
      semester: 'FA26', periodStart: '2026-09-07', periodEnd: '2026-12-27', weekStart: '2026-10-19', snapshotDate: '2026-10-22', startedAt: now, generatedAt: now, durationMs: 1
    };
    const broken: Backend.LeaderboardEntryInput = { category: 'OVERALL', studentId: 'missing', classId, rank: 1, position: 1, value: 1, criteria: null };

    await expect(LeaderboardRepository.saveSnapshot(header, [broken])).rejects.toThrow();

    expect(await TestDatabase.prisma.leaderboardEntry.count()).toBe(before);
    expect(await TestDatabase.prisma.leaderboardSnapshot.count()).toBe(1);
  });

  it('student in two classes is ranked once, shown with the class of most activity', async () => {
    const student = await TestDatabase.createUser({ studentCode: 'SE9' });
    const classB = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26', name: 'Lớp B' });
    await TestDatabase.addMember(classId, student.id, lecturer.id);
    await TestDatabase.addMember(classB.id, student.id, lecturer.id);
    const inA = await TestDatabase.createAssignment(classId, lecturer.id, { kind: 'SOLO' });
    const inB = await TestDatabase.createAssignment(classB.id, lecturer.id, { kind: 'SOLO' });
    await TestDatabase.createSubmission(inA.id, student.id, { submittedAt: at('2026-10-20T03:00:00Z') });
    await TestDatabase.createSubmission(inB.id, student.id, { submittedAt: at('2026-10-20T04:00:00Z') });
    await TestDatabase.createSubmission(inB.id, student.id, { submittedAt: at('2026-10-21T04:00:00Z') });

    await LeaderboardSnapshotService.build(now);

    const overall = await readCategory('OVERALL');
    expect(overall).toHaveLength(1);
    expect(overall[0]).toMatchObject({ studentId: student.id, className: 'Lớp B', rank: 1, value: 100 });
  });

  it('a tie on activity is shown under the class name that sorts first', async () => {
    const student = await TestDatabase.createUser({ studentCode: 'SE9' });
    const classB = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26', name: 'Lớp 0B' });
    await TestDatabase.addMember(classId, student.id, lecturer.id);
    await TestDatabase.addMember(classB.id, student.id, lecturer.id);
    const inA = await TestDatabase.createAssignment(classId, lecturer.id, { kind: 'SOLO' });
    const inB = await TestDatabase.createAssignment(classB.id, lecturer.id, { kind: 'SOLO' });
    await TestDatabase.createSubmission(inA.id, student.id, { submittedAt: at('2026-10-20T03:00:00Z') });
    await TestDatabase.createSubmission(inB.id, student.id, { submittedAt: at('2026-10-20T04:00:00Z') });

    await LeaderboardSnapshotService.build(now);

    expect((await readCategory('OVERALL'))[0].className).toBe('Lớp 0B');
  });

  it('writes nothing when no semester covers today, and an empty snapshot when nobody was active', async () => {
    await setSemesters([{ name: 'SP27', startDate: '2027-01-04', endDate: '2027-04-25' }]);
    expect(await LeaderboardSnapshotService.build(now)).toBeNull();
    expect(await TestDatabase.prisma.leaderboardSnapshot.count()).toBe(0);

    await setSemesters([{ name: 'FA26', startDate: '2026-09-07', endDate: '2026-12-27' }]);
    const result = await LeaderboardSnapshotService.build(now);
    expect(result).toMatchObject({ semester: 'FA26', rowCount: 0 });
    expect(await TestDatabase.prisma.leaderboardSnapshot.count()).toBe(1);
    expect(await TestDatabase.prisma.leaderboardEntry.count()).toBe(0);
  });

  it('ignores activity outside the semester dates', async () => {
    const student = await TestDatabase.createUser({ studentCode: 'SE9' });
    await TestDatabase.addMember(classId, student.id, lecturer.id);
    const solo = await TestDatabase.createAssignment(classId, lecturer.id, { kind: 'SOLO' });
    await TestDatabase.createSubmission(solo.id, student.id, { submittedAt: at('2026-09-06T16:59:00Z') });

    await LeaderboardSnapshotService.build(now);

    expect(await TestDatabase.prisma.leaderboardEntry.count()).toBe(0);
  });

  describe('LeaderboardScheduler.tick', () => {
    it('does not build before 08:00 Vietnam time, builds exactly once afterwards', async () => {
      await seedThreeStudents();

      await LeaderboardScheduler.tick(at('2026-10-21T23:30:00Z')); // 06:30 on 22/10
      expect(await TestDatabase.prisma.leaderboardSnapshot.count()).toBe(0);

      await LeaderboardScheduler.tick(at('2026-10-22T01:00:00Z')); // 08:00 on 22/10
      const [snapshot] = await TestDatabase.prisma.leaderboardSnapshot.findMany();
      expect(snapshot.generatedAt.toISOString()).toBe('2026-10-22T01:00:00.000Z');

      await LeaderboardScheduler.tick(at('2026-10-22T05:00:00Z'));
      const snapshots = await TestDatabase.prisma.leaderboardSnapshot.findMany();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].generatedAt.toISOString()).toBe('2026-10-22T01:00:00.000Z');
    });

    it('catches up a missed run on the next tick and survives errors', async () => {
      await LeaderboardScheduler.tick(at('2026-10-22T09:00:00Z'));
      expect(await TestDatabase.prisma.leaderboardSnapshot.count()).toBe(1);
      await TestDatabase.prisma.systemConfig.delete({ where: { key: PlatformConstant.settingKeys.MIN_ACCURACY } });
      await expect(LeaderboardScheduler.tick(at('2026-10-23T09:00:00Z'))).resolves.toBeUndefined();
    });
  });
});
