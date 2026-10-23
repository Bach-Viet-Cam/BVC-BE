import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Submission comments (lecturer)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let lecturerToken: string;
  let classRecord: Awaited<ReturnType<typeof TestDatabase.createClass>>;
  let student: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let membershipId: string;
  let assignmentId: string;
  let submissionId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    lecturer = await TestDatabase.createLecturer();
    lecturerToken = TestDatabase.tokenFor(lecturer);
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    classRecord = await TestDatabase.createClass(lecturer.id, tranh.id, { name: 'TRD301', startDate: TestDatabase.futureDate(-3) });
    student = await TestDatabase.createUser({ username: 'Trần Minh Anh', studentCode: 'SE1' });
    membershipId = (await TestDatabase.addMember(classRecord.id, student.id, lecturer.id)).id;
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { title: 'Độc tấu' });
    assignmentId = assignment.id;
    submissionId = (await TestDatabase.createSubmission(assignment.id, student.id)).id;
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const comment = (content: unknown, token: string = lecturerToken, id: string = submissionId) =>
    request(app).put(`/api/v1/submissions/${id}/comment`).set('Authorization', token).send({ content });

  it('first comment notifies the student, update does not', async () => {
    const first = await comment('  Nhịp tuần này ổn, chú ý ngón vê.  ');
    expect(first.status).toBe(200);
    expect(first.body.message).toBe('Gửi nhận xét thành công.');
    expect(first.body.data).toMatchObject({ content: 'Nhịp tuần này ổn, chú ý ngón vê.' });
    const deliveries = await TestDatabase.prisma.userNotification.findMany({ where: { userId: student.id }, include: { notification: true } });
    const notifications = deliveries.map((delivery) => delivery.notification);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ title: 'Giảng viên đã nhận xét bài nộp', body: 'TRD301 · Độc tấu', link: `/assignment/${assignmentId}` });

    const update = await comment('Đã sửa nhận xét');
    expect(update.body.message).toBe('Cập nhật nhận xét thành công.');
    expect(await TestDatabase.prisma.userNotification.count()).toBe(1);
    expect(await TestDatabase.prisma.submissionComment.count()).toBe(1);

    const submissions = await request(app).get(`/api/v1/assignments/${assignmentId}/students/${student.id}/submissions`).set('Authorization', lecturerToken);
    expect(submissions.body.data.submissions[0].comment).toMatchObject({ content: 'Đã sửa nhận xét' });
  });

  it('content 1–2000 after trim', async () => {
    const blank = await comment('   ');
    expect(blank.status).toBe(400);
    expect(blank.body.errors[0]).toMatchObject({ field: 'content', message: 'Nhận xét không được để trống.' });
    expect((await comment('x'.repeat(2001))).body.errors[0]).toMatchObject({ field: 'content', message: 'Nhận xét không được vượt quá 2000 ký tự.' });
    expect((await comment('x'.repeat(2000))).status).toBe(200);
  });

  it('comment is locked for a removed student or finished class (409)', async () => {
    await TestDatabase.prisma.classMember.update({ where: { id: membershipId }, data: { removedAt: new Date() } });
    const removed = await comment('Không gửi được');
    expect(removed.status).toBe(409);
    expect(removed.body.message).toBe('Không thể nhận xét vì lớp đã kết thúc hoặc sinh viên không còn trong lớp.');

    await TestDatabase.prisma.classMember.update({ where: { id: membershipId }, data: { removedAt: null } });
    await TestDatabase.prisma.class.update({ where: { id: classRecord.id }, data: { status: 'ENDED' } });
    expect((await comment('Không gửi được')).status).toBe(409);
    expect(await TestDatabase.prisma.submissionComment.count()).toBe(0);
  });

  it('another lecturer gets 404', async () => {
    const otherToken = TestDatabase.tokenFor(await TestDatabase.createLecturer());
    expect((await comment('Xin chào', otherToken)).status).toBe(404);
    expect((await comment('Xin chào', lecturerToken, '6f1c2e9a-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('student sees own attempts newest first with the lecturer comment', async () => {
    const secondId = (await TestDatabase.createSubmission(assignmentId, student.id, { accuracy: 92, submittedAt: new Date(Date.now() + 60_000) })).id;
    await comment('Nhịp ổn, chú ý ô nhịp 12.');
    const otherStudent = await TestDatabase.createUser({ username: 'Lê Hà', studentCode: 'SE2' });
    await TestDatabase.addMember(classRecord.id, otherStudent.id, lecturer.id);
    await TestDatabase.createSubmission(assignmentId, otherStudent.id);

    const response = await request(app).get(`/api/v1/assignments/${assignmentId}`).set('Authorization', TestDatabase.tokenFor(student));
    expect(response.status).toBe(200);
    const submissions = response.body.data.submissions;
    expect(submissions).toHaveLength(2);
    expect(submissions[0]).toMatchObject({ id: secondId, attemptNumber: 2, accuracy: 92, comment: null });
    expect(submissions[1]).toMatchObject({ id: submissionId, attemptNumber: 1, comment: { content: 'Nhịp ổn, chú ý ô nhịp 12.' } });
  });

  it("removed student's submissions stay viewable with canComment false", async () => {
    await TestDatabase.prisma.classMember.update({ where: { id: membershipId }, data: { removedAt: new Date() } });
    const response = await request(app).get(`/api/v1/assignments/${assignmentId}/students/${student.id}/submissions`).set('Authorization', lecturerToken);
    expect(response.status).toBe(200);
    expect(response.body.data.canComment).toBe(false);
    expect(response.body.data.submissions).toHaveLength(1);
  });
});
