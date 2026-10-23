import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import LeaderboardRepository from '../../src/modules/leaderboard/repository/LeaderboardRepository.ts';
import LeaderboardSourceRepository from '../../src/modules/leaderboard/repository/LeaderboardSourceRepository.ts';
import TestDatabase from './TestDatabase.ts';

describe('Leaderboard repositories (UC-17)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let instrumentId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    lecturer = await TestDatabase.createLecturer();
    instrumentId = (await TestDatabase.createInstrument()).id;
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  describe('LeaderboardSourceRepository', () => {
    it('returns one row per membership: a student in two classes appears twice', async () => {
      const first = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26', name: 'Lớp A' });
      const second = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26', name: 'Lớp B', status: 'ENDED' });
      const student = await TestDatabase.createUser({ studentCode: 'SE1' });
      await TestDatabase.addMember(first.id, student.id, lecturer.id);
      await TestDatabase.addMember(second.id, student.id, lecturer.id);

      const members = await LeaderboardSourceRepository.findSemesterMembers('FA26');

      expect(members.map((member) => member.className).sort()).toEqual(['Lớp A', 'Lớp B']);
      expect(new Set(members.map((member) => member.studentId))).toEqual(new Set([student.id]));
    });

    it('skips removed members, other semesters and non-students', async () => {
      const current = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26' });
      const other = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'SP26' });
      const kept = await TestDatabase.createUser();
      const removed = await TestDatabase.createUser();
      const elsewhere = await TestDatabase.createUser();
      const teacherMember = await TestDatabase.createLecturer();
      await TestDatabase.addMember(current.id, kept.id, lecturer.id);
      const removedMembership = await TestDatabase.addMember(current.id, removed.id, lecturer.id);
      await TestDatabase.prisma.classMember.update({ where: { id: removedMembership.id }, data: { removedAt: new Date() } });
      await TestDatabase.addMember(other.id, elsewhere.id, lecturer.id);
      await TestDatabase.addMember(current.id, teacherMember.id, lecturer.id);

      const members = await LeaderboardSourceRepository.findSemesterMembers('FA26');

      expect(members.map((member) => member.studentId)).toEqual([kept.id]);
    });

    it('reads submissions and assignments of the given classes', async () => {
      const classRecord = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26' });
      const student = await TestDatabase.createUser();
      await TestDatabase.addMember(classRecord.id, student.id, lecturer.id);
      const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'SOLO' });
      const bonus = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'BONUS' });
      await TestDatabase.prisma.assignment.update({ where: { id: bonus.id }, data: { bonusPoints: 7 } });
      const draft = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'OTHER', status: 'DRAFT' });
      const deleted = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { kind: 'OTHER', deletedAt: new Date() });
      const inside = new Date('2026-10-20T03:00:00Z');
      await TestDatabase.createSubmission(solo.id, student.id, { submittedAt: inside, accuracy: 90 });
      await TestDatabase.createSubmission(solo.id, student.id, { submittedAt: new Date('2026-08-01T03:00:00Z') });
      await TestDatabase.createSubmission(deleted.id, student.id, { submittedAt: inside });

      const from = new Date('2026-09-06T17:00:00Z');
      const to = new Date('2026-12-27T17:00:00Z');
      const submissions = await LeaderboardSourceRepository.findSubmissions([student.id], [classRecord.id], from, to);
      const counted = await LeaderboardSourceRepository.findCountedAssignments([classRecord.id]);
      const bonuses = await LeaderboardSourceRepository.findBonusAssignments([classRecord.id]);

      expect(submissions).toHaveLength(1);
      expect(submissions[0]).toMatchObject({ studentId: student.id, classId: classRecord.id, assignmentId: solo.id, kind: 'SOLO', assignmentStatus: 'PUBLISHED', accuracy: 90 });
      expect(counted.map((assignment) => assignment.id)).toEqual([solo.id]);
      expect(bonuses).toEqual([{ id: bonus.id, classId: classRecord.id, bonusPoints: 7 }]);
      expect([draft.id, deleted.id]).not.toContain(counted[0].id);
    });
  });

  describe('LeaderboardRepository', () => {
    const header = (snapshotDate: string, generatedAt: string): Backend.LeaderboardSnapshotHeader => ({
      semester: 'FA26',
      periodStart: '2026-09-07',
      periodEnd: '2026-12-27',
      weekStart: '2026-10-19',
      snapshotDate,
      startedAt: new Date(generatedAt),
      generatedAt: new Date(generatedAt),
      durationMs: 12
    });

    it('stores, pages and finds entries; replacing a day keeps other days', async () => {
      const classRecord = await TestDatabase.createClass(lecturer.id, instrumentId, { cohort: 'FA26', name: 'Lớp A' });
      const students = [await TestDatabase.createUser({ username: 'An' }), await TestDatabase.createUser({ username: 'Bình' }), await TestDatabase.createUser({ username: 'Chi' })];
      const entries = students.map((student, index): Backend.LeaderboardEntryInput => ({
        category: 'ACCURACY',
        studentId: student.id,
        classId: classRecord.id,
        rank: index + 1,
        position: index + 1,
        value: 90 - index,
        criteria: null
      }));
      const client = TestDatabase.prisma;
      const yesterday = await client.$transaction((transaction) => LeaderboardRepository.replaceSnapshot(transaction, header('2026-10-21', '2026-10-21T01:00:00Z'), entries));
      const first = await client.$transaction((transaction) => LeaderboardRepository.replaceSnapshot(transaction, header('2026-10-22', '2026-10-22T01:00:00Z'), entries));
      const second = await client.$transaction((transaction) => LeaderboardRepository.replaceSnapshot(transaction, header('2026-10-22', '2026-10-22T02:00:00Z'), entries.slice(0, 2)));

      expect(await client.leaderboardSnapshot.count()).toBe(2);
      expect(await client.leaderboardSnapshot.findUnique({ where: { id: first } })).toBeNull();
      expect(await LeaderboardRepository.countEntries(yesterday, 'ACCURACY')).toBe(3);
      expect(await LeaderboardRepository.countEntries(second, 'ACCURACY')).toBe(2);

      const latest = await LeaderboardRepository.findLatest('FA26');
      expect(latest).toMatchObject({ id: second, snapshotDate: '2026-10-22' });
      expect((await LeaderboardRepository.findBySemesterAndDate('FA26', '2026-10-21'))?.id).toBe(yesterday);
      expect(await LeaderboardRepository.findBySemesterAndDate('FA26', '2026-10-20')).toBeNull();
      expect(await LeaderboardRepository.findLatest('SP26')).toBeNull();

      const page = await LeaderboardRepository.findPage(yesterday, 'ACCURACY', 1, 2);
      expect(page.map((entry) => [entry.fullName, entry.className, entry.rank, entry.value])).toEqual([['Bình', 'Lớp A', 2, 89], ['Chi', 'Lớp A', 3, 88]]);
      expect((await LeaderboardRepository.findEntry(yesterday, 'ACCURACY', students[2].id))?.position).toBe(3);
      expect(await LeaderboardRepository.findEntry(yesterday, 'STREAK', students[2].id)).toBeNull();
    });
  });
});
