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
    await TestDatabase.prisma.piece.update({ where: { id: piece.id }, data: { defaultBpm: 96 } });
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { pieceId: piece.id });
    const anh = await member('Trần Minh Anh', 'SE1');
    const han = await member('Phạm Gia Hân', 'SE2');
    await member('Ngô Thảo My', 'SE3');
    await TestDatabase.createSubmission(assignment.id, anh.id, { accuracy: 82, submittedAt: new Date('2026-10-15T02:30:00Z') });
    await TestDatabase.createSubmission(assignment.id, anh.id, { accuracy: 55, submittedAt: new Date('2026-10-16T02:30:00Z') });
    await TestDatabase.createSubmission(assignment.id, han.id, { accuracy: 40 });

    const response = await get(`/assignments/${assignment.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ requiredBpm: null, effectiveBpm: 96, piece: { id: piece.id, title: 'Lý ngựa ô', defaultBpm: 96, isAvailable: true } });
    const byCode = Object.fromEntries(response.body.data.students.map((student: { studentCode: string }) => [student.studentCode, student]));
    expect(byCode.SE1).toMatchObject({ fullName: 'Trần Minh Anh', status: 'PASSED', submissionCount: 2, bestAccuracy: 82, lastSubmittedAt: '2026-10-16T02:30:00.000Z' });
    expect(byCode.SE2).toMatchObject({ status: 'SUBMITTED', submissionCount: 1, bestAccuracy: 40 });
    expect(byCode.SE3).toMatchObject({ status: 'NOT_SUBMITTED', submissionCount: 0, bestAccuracy: null, lastSubmittedAt: null });
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

  it('lists visible pieces of the class instrument', async () => {
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    await TestDatabase.createPiece(tranh.id, { title: 'B — Lý ngựa ô', kind: 'SONG' });
    await TestDatabase.createPiece(tranh.id, { title: 'A — Gẩy đơn' });
    await TestDatabase.createPiece(tranh.id, { title: 'Ẩn', isVisible: false });
    await TestDatabase.createPiece(bau.id, { title: 'Bầu' });
    const response = await get(`/assignments/pieces?classId=${classRecord.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { title: string; kind: string }) => [item.title, item.kind])).toEqual([['A — Gẩy đơn', 'FINGER_EXERCISE'], ['B — Lý ngựa ô', 'SONG']]);
    const otherToken = TestDatabase.tokenFor(await TestDatabase.createLecturer());
    expect((await get(`/assignments/pieces?classId=${classRecord.id}`, otherToken)).status).toBe(404);
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
    await TestDatabase.prisma.class.update({ where: { id: classRecord.id }, data: { status: 'FINISHED' } });
    expect(await SubmissionPolicyService.canSubmit(anh.id, published.id)).toEqual({ allowed: false, reason });
  });
});
