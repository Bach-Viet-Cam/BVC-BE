import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import SubmissionPolicyService from '../../src/modules/assignments/service/SubmissionPolicyService.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Assignment queries (lecturer) + canSubmit', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let lecturerToken: string;
  let tranh: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;
  let classRecord: Awaited<ReturnType<typeof TestDatabase.createClass>>;

  beforeEach(async () => {
    await TestDatabase.reset();
    lecturer = await TestDatabase.createLecturer();
    lecturerToken = TestDatabase.tokenFor(lecturer);
    tranh = await TestDatabase.createInstrument('Đàn tranh');
    classRecord = await TestDatabase.createClass(lecturer.id, tranh.id, { name: 'TRD301', startDate: TestDatabase.futureDate(-3) });
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const get = (path: string, token: string = lecturerToken) => request(app).get(`/api/v1${path}`).set('Authorization', token);

  async function member(name: string, code: string) {
    const student = await TestDatabase.createUser({ username: name, studentCode: code });
    await TestDatabase.addMember(classRecord.id, student.id, lecturer.id);
    return student;
  }

  it('lists own non-deleted assignments with filters and submittedCount', async () => {
    const anh = await member('Trần Minh Anh', 'SE1');
    await member('Phạm Gia Hân', 'SE2');
    const solo = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { title: 'Độc tấu Lý ngựa ô', kind: 'SOLO' });
    await TestDatabase.createAssignment(classRecord.id, lecturer.id, { title: 'Hòa tấu', kind: 'ENSEMBLE', status: 'DRAFT' });
    await TestDatabase.createAssignment(classRecord.id, lecturer.id, { title: 'Đã xóa', deletedAt: new Date() });
    const other = await TestDatabase.createLecturer();
    const otherClass = await TestDatabase.createClass(other.id, tranh.id);
    await TestDatabase.createAssignment(otherClass.id, other.id, { title: 'Không phải của tôi' });
    await TestDatabase.createSubmission(solo.id, anh.id);
    await TestDatabase.createSubmission(solo.id, anh.id, { status: 'REJECTED' });

    const all = await get('/assignments');
    expect(all.status).toBe(200);
    expect(all.body.data.items.map((item: { title: string }) => item.title).sort()).toEqual(['Hòa tấu', 'Độc tấu Lý ngựa ô'].sort());
    const soloItem = all.body.data.items.find((item: { id: string }) => item.id === solo.id);
    expect(soloItem).toMatchObject({ classId: classRecord.id, className: 'TRD301', status: 'PUBLISHED', version: 1, kind: 'SOLO', submittedCount: 1, memberCount: 2 });

    expect((await get('/assignments?kind=ENSEMBLE')).body.data.items.map((item: { title: string }) => item.title)).toEqual(['Hòa tấu']);
    expect((await get('/assignments?status=DRAFT')).body.data.items).toHaveLength(1);
    expect((await get(`/assignments?classId=${classRecord.id}&q=lý ngựa`)).body.data.items).toHaveLength(1);
    expect((await get(`/assignments?classId=${otherClass.id}`)).body.data.items).toHaveLength(0);
  });

  it('detail lists active members with status, counts, best accuracy and effective bpm', async () => {
    const piece = await TestDatabase.createPiece(tranh.id, { title: 'Lý ngựa ô' });
    await TestDatabase.prisma.piece.update({ where: { id: piece.id }, data: { bpm: 96 } });
    const sheet = await TestDatabase.createSheetMusic(piece.id, tranh.id, { name: 'Bản chính' });
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { sheetMusicId: sheet.id });
    const anh = await member('Trần Minh Anh', 'SE1');
    const han = await member('Phạm Gia Hân', 'SE2');
    await member('Ngô Thảo My', 'SE3');
    await TestDatabase.createSubmission(assignment.id, anh.id, { accuracy: 82, submittedAt: new Date('2026-10-15T02:30:00Z') });
    await TestDatabase.createSubmission(assignment.id, anh.id, { accuracy: 55, submittedAt: new Date('2026-10-16T02:30:00Z') });
    await TestDatabase.createSubmission(assignment.id, han.id, { accuracy: 40 });

    const response = await get(`/assignments/${assignment.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ requiredBpm: null, effectiveBpm: 96,
      sheetMusic: { id: sheet.id, name: 'Bản chính', pieceId: piece.id, pieceTitle: 'Lý ngựa ô', defaultBpm: 96, isAvailable: true }
    });
    const byCode = Object.fromEntries(response.body.data.students.map((student: { studentCode: string }) => [student.studentCode, student]));
    expect(byCode.SE1).toMatchObject({ fullName: 'Trần Minh Anh', status: 'PASSED', submissionCount: 2, bestAccuracy: 82, lastSubmittedAt: '2026-10-16T02:30:00.000Z' });
    expect(byCode.SE2).toMatchObject({ status: 'SUBMITTED', submissionCount: 1, bestAccuracy: 40 });
    expect(byCode.SE3).toMatchObject({ status: 'NOT_SUBMITTED', submissionCount: 0, bestAccuracy: null, lastSubmittedAt: null });
  });

  it('returns practice stats, threshold, creator and media for one assignment', async () => {
    const piece = await TestDatabase.createPiece(tranh.id, { title: 'Lý ngựa ô' });
    const sheet = await TestDatabase.createSheetMusic(piece.id, tranh.id, { name: 'Bản chính' });
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { sheetMusicId: sheet.id });
    const anh = await member('Trần Minh Anh', 'SE1');
    await member('Phạm Gia Hân', 'SE2');
    const outsider = await TestDatabase.createUser({ studentCode: 'SE9' });
    await TestDatabase.resetGradingSettings(65, 30);
    await TestDatabase.createSubmission(assignment.id, anh.id);
    await TestDatabase.createSubmission(assignment.id, anh.id);
    await TestDatabase.createSubmission(assignment.id, anh.id, { status: 'REJECTED' });
    await TestDatabase.createSubmission(assignment.id, outsider.id);

    const response = await get(`/assignments/${assignment.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.practiceStats).toMatchObject({ totalPractices: 3, practicedStudents: 1, memberCount: 2, averagePerStudent: 3 });
    expect(response.body.data.practiceStats.last7Days).toHaveLength(7);
    expect(response.body.data.minAccuracy).toBe(65);
    expect(response.body.data.createdBy).toMatchObject({ id: lecturer.id });
    expect(response.body.data.media.sheet).not.toBeNull();
    expect(response.body.data.media.sheet).toMatchObject({ originalName: 'sheet.pdf', mimeType: 'application/pdf' });
    expect(response.body.data.media.referenceAudio).toBeNull();
    expect(response.body.data.media.tutorialVideo).toBeNull();
  });

  it('media is null without sheet music', async () => {
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const response = await get(`/assignments/${assignment.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.media).toBeNull();
    expect(response.body.data.practiceStats).toMatchObject({ totalPractices: 0, memberCount: 0 });
  });

  it('removed student is excluded from students and submittedCount', async () => {
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const removed = await TestDatabase.createUser({ studentCode: 'SE9' });
    const membership = await TestDatabase.addMember(classRecord.id, removed.id, lecturer.id);
    await TestDatabase.createSubmission(assignment.id, removed.id);
    await TestDatabase.prisma.classMember.update({ where: { id: membership.id }, data: { removedAt: new Date() } });

    expect((await get(`/assignments/${assignment.id}`)).body.data.students).toEqual([]);
    expect((await get('/assignments')).body.data.items[0]).toMatchObject({ submittedCount: 0, memberCount: 0 });
  });

  it('old submissions keep their version after an edit', async () => {
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const anh = await member('Trần Minh Anh', 'SE1');
    await TestDatabase.createSubmission(assignment.id, anh.id, { submittedAt: new Date('2026-10-15T01:00:00Z') });
    await request(app).put(`/api/v1/assignments/${assignment.id}`).set('Authorization', lecturerToken).send({ title: 'Bản 2', kind: 'SOLO' }).expect(200);
    await TestDatabase.createSubmission(assignment.id, anh.id, { submittedAt: new Date('2026-10-16T01:00:00Z') });

    const response = await get(`/assignments/${assignment.id}/students/${anh.id}/submissions`);
    expect(response.status).toBe(200);
    expect(response.body.data.submissions.map((item: { attemptNumber: number; version: number }) => [item.attemptNumber, item.version])).toEqual([[2, 2], [1, 1]]);
    expect(response.body.data).toMatchObject({ canComment: true, student: { id: anh.id, fullName: 'Trần Minh Anh', studentCode: 'SE1' } });
    expect(response.body.data.submissions[0]).toMatchObject({ status: 'COMPLETED', accuracy: 80, audioUrl: '/samples/bvc-sample.wav', comment: null });
  });

  it('status follows the current grading settings', async () => {
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const anh = await member('Trần Minh Anh', 'SE1');
    await TestDatabase.createSubmission(assignment.id, anh.id, { accuracy: 65 });
    expect((await get(`/assignments/${assignment.id}`)).body.data.students[0].status).toBe('SUBMITTED');
    await TestDatabase.resetGradingSettings(60, 30);
    expect((await get(`/assignments/${assignment.id}`)).body.data.students[0].status).toBe('PASSED');
  });

  it('lists visible sheet music of the class instrument', async () => {
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    const song = await TestDatabase.createPiece(tranh.id, { title: 'B — Lý ngựa ô', kind: 'SONG' });
    const exercise = await TestDatabase.createPiece(tranh.id, { title: 'A — Gẩy đơn' });
    const hiddenPiece = await TestDatabase.createPiece(tranh.id, { title: 'Ẩn', isVisible: false });
    await TestDatabase.createSheetMusic(song.id, tranh.id, { name: 'Bản nâng cao' });
    await TestDatabase.createSheetMusic(song.id, tranh.id, { name: 'Bản cơ bản' });
    await TestDatabase.createSheetMusic(song.id, tranh.id, { name: 'Bản ẩn', visibility: 'HIDDEN' });
    await TestDatabase.createSheetMusic(song.id, bau.id, { name: 'Bản bầu' });
    await TestDatabase.createSheetMusic(exercise.id, tranh.id, { name: 'Bản chính' });
    await TestDatabase.createSheetMusic(hiddenPiece.id, tranh.id, { name: 'Bản của bài ẩn' });
    const response = await get(`/assignments/sheet-music?classId=${classRecord.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { pieceTitle: string; name: string; kind: string }) => [item.pieceTitle, item.name, item.kind])).toEqual([
      ['A — Gẩy đơn', 'Bản chính', 'FINGER_EXERCISE'],
      ['B — Lý ngựa ô', 'Bản cơ bản', 'SONG'],
      ['B — Lý ngựa ô', 'Bản nâng cao', 'SONG']
    ]);
    const otherToken = TestDatabase.tokenFor(await TestDatabase.createLecturer());
    expect((await get(`/assignments/sheet-music?classId=${classRecord.id}`, otherToken)).status).toBe(404);
  });

  it('another lecturer gets 404 on detail and submissions; deleted assignment is 404', async () => {
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const anh = await member('Trần Minh Anh', 'SE1');
    const otherToken = TestDatabase.tokenFor(await TestDatabase.createLecturer());
    expect((await get(`/assignments/${assignment.id}`, otherToken)).status).toBe(404);
    expect((await get(`/assignments/${assignment.id}/students/${anh.id}/submissions`, otherToken)).status).toBe(404);
    await TestDatabase.prisma.assignment.update({ where: { id: assignment.id }, data: { deletedAt: new Date() } });
    expect((await get(`/assignments/${assignment.id}`)).status).toBe(404);
    const stranger = await TestDatabase.createUser();
    const live = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    expect((await get(`/assignments/${live.id}/students/${stranger.id}/submissions`)).status).toBe(404);
  });

  it('canSubmit: published + active class + active member only', async () => {
    const reason = 'Không thể nộp bài vì bài tập đã đóng hoặc không còn khả dụng.';
    const anh = await member('Trần Minh Anh', 'SE1');
    const published = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { status: 'PUBLISHED' });
    const draft = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { status: 'DRAFT' });
    const closed = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { status: 'CLOSED' });
    const deleted = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { deletedAt: new Date() });
    const outsider = await TestDatabase.createUser();

    expect(await SubmissionPolicyService.canSubmit(anh.id, published.id)).toEqual({ allowed: true, reason: null });
    for (const assignmentId of [draft.id, closed.id, deleted.id, '6f1c2e9a-0000-4000-8000-000000000000']) {
      expect(await SubmissionPolicyService.canSubmit(anh.id, assignmentId)).toEqual({ allowed: false, reason });
    }
    expect(await SubmissionPolicyService.canSubmit(outsider.id, published.id)).toEqual({ allowed: false, reason });
    await TestDatabase.prisma.class.update({ where: { id: classRecord.id }, data: { status: 'ENDED' } });
    expect(await SubmissionPolicyService.canSubmit(anh.id, published.id)).toEqual({ allowed: false, reason });
  });

  describe('sheet group', () => {
    async function seedSheet() {
      await TestDatabase.resetSemesters([{ name: 'CUR', startDate: TestDatabase.futureDate(-30), endDate: TestDatabase.futureDate(30) }]);
      const piece = await TestDatabase.createPiece(tranh.id, { title: 'Lý ngựa ô' });
      const sheet = await TestDatabase.createSheetMusic(piece.id, tranh.id);
      const classA = await TestDatabase.createClass(lecturer.id, tranh.id, { name: 'A-CLASS', cohort: 'CUR' });
      const classB = await TestDatabase.createClass(lecturer.id, tranh.id, { name: 'B-CLASS', cohort: 'CUR' });
      return { sheet, classA, classB };
    }

    async function addStudent(classId: string, code: string) {
      const student = await TestDatabase.createUser({ username: `SV ${code}`, studentCode: code });
      await TestDatabase.addMember(classId, student.id, lecturer.id);
      return student;
    }

    it('aggregates copies of one sheet across current-semester classes', async () => {
      const { sheet, classA, classB } = await seedSheet();
      const copyA = await TestDatabase.createAssignment(classA.id, lecturer.id, { kind: 'SOLO', sheetMusicId: sheet.id });
      const copyB = await TestDatabase.createAssignment(classB.id, lecturer.id, { kind: 'SOLO', sheetMusicId: sheet.id });
      const anh = await addStudent(classA.id, 'SE1');
      await addStudent(classA.id, 'SE2');
      const han = await addStudent(classB.id, 'SE3');
      await TestDatabase.createSubmission(copyA.id, anh.id);
      await TestDatabase.createSubmission(copyA.id, anh.id);
      await TestDatabase.createSubmission(copyB.id, han.id);
      await TestDatabase.createSubmission(copyB.id, han.id, { status: 'REJECTED' });

      const oldClass = await TestDatabase.createClass(lecturer.id, tranh.id, { name: 'OLD', cohort: 'SP25' });
      await TestDatabase.createAssignment(oldClass.id, lecturer.id, { kind: 'SOLO', sheetMusicId: sheet.id });
      const other = await TestDatabase.createLecturer();
      const otherClass = await TestDatabase.createClass(other.id, tranh.id, { name: 'OTHER', cohort: 'CUR' });
      await TestDatabase.createAssignment(otherClass.id, other.id, { kind: 'SOLO', sheetMusicId: sheet.id });

      const response = await get(`/assignments/sheet-groups/${sheet.id}`);
      expect(response.status).toBe(200);
      const data = response.body.data;
      expect(data.semester.name).toBe('CUR');
      expect(data.sheetMusic.id).toBe(sheet.id);
      expect(data.assignments.map((item: { className: string }) => item.className)).toEqual(['A-CLASS', 'B-CLASS']);
      expect(data.assignments[0]).toMatchObject({ practiceCount: 2, submittedCount: 1, memberCount: 2, minAccuracy: expect.any(Number) });
      expect(data.assignments[0].createdBy).toMatchObject({ id: lecturer.id });
      expect(data.byClass).toHaveLength(2);
      expect(data.practiceStats).toMatchObject({ totalPractices: 3, practicedStudents: 2, memberCount: 3 });
      expect(data.media.sheet).not.toBeNull();
    });

    it('lists draft copies but leaves them out of stats', async () => {
      const { sheet, classA } = await seedSheet();
      await TestDatabase.createAssignment(classA.id, lecturer.id, { kind: 'SOLO', sheetMusicId: sheet.id, status: 'DRAFT' });
      await addStudent(classA.id, 'SE1');

      const response = await get(`/assignments/sheet-groups/${sheet.id}`);
      expect(response.status).toBe(200);
      expect(response.body.data.assignments[0].status).toBe('DRAFT');
      expect(response.body.data.practiceStats).toMatchObject({ totalPractices: 0, memberCount: 0 });
      expect(response.body.data.byClass).toEqual([]);
    });

    it('overview sheetStats matches the sheet group detail', async () => {
      const { sheet, classA, classB } = await seedSheet();
      const copyA = await TestDatabase.createAssignment(classA.id, lecturer.id, { kind: 'SOLO', sheetMusicId: sheet.id });
      const bonusA = await TestDatabase.createAssignment(classA.id, lecturer.id, { kind: 'BONUS', sheetMusicId: sheet.id });
      const copyB = await TestDatabase.createAssignment(classB.id, lecturer.id, { kind: 'SOLO', sheetMusicId: sheet.id });
      await TestDatabase.createAssignment(classB.id, lecturer.id, { kind: 'SOLO', sheetMusicId: sheet.id, status: 'DRAFT' });
      const anh = await addStudent(classA.id, 'SE1');
      await addStudent(classA.id, 'SE2');
      const han = await addStudent(classB.id, 'SE3');
      await TestDatabase.createSubmission(copyA.id, anh.id);
      await TestDatabase.createSubmission(bonusA.id, anh.id);
      await TestDatabase.createSubmission(copyB.id, han.id);
      await TestDatabase.createSubmission(copyB.id, han.id, { status: 'REJECTED' });

      const detail = (await get(`/assignments/sheet-groups/${sheet.id}`)).body.data;
      const overview = await get('/assignments/overview');
      expect(overview.status).toBe(200);
      expect(overview.body.data.sheetStats).toEqual([
        {
          sheetMusicId: sheet.id,
          practiceCount: detail.practiceStats.totalPractices,
          practicedStudents: detail.practiceStats.practicedStudents,
          memberCount: detail.practiceStats.memberCount
        }
      ]);
      expect(detail.practiceStats).toMatchObject({ totalPractices: 3, practicedStudents: 2, memberCount: 3 });
    });

    it('returns 404 when no copy exists and rejects a student token', async () => {
      const { sheet } = await seedSheet();
      const missing = await get(`/assignments/sheet-groups/${sheet.id}`);
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('Không tìm thấy bài tập dùng sheet nhạc này trong học kỳ hiện tại.');

      const studentToken = TestDatabase.tokenFor(await TestDatabase.createUser());
      expect((await get(`/assignments/sheet-groups/${sheet.id}`, studentToken)).status).toBe(403);
      expect((await get('/assignments/sheet-groups/not-a-uuid')).status).toBe(400);
    });
  });
});
