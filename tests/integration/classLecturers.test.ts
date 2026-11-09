import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Class co-lecturers', () => {
  let classRecord: Awaited<ReturnType<typeof TestDatabase.createClass>>;
  let owner: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let coLecturer: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let instrument: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;
  let outsider: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let ownerToken: string;
  let coToken: string;
  let outsiderToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    owner = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, email: 'gv.chinh@fpt.edu.vn' });
    coLecturer = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, email: 'gvcung.day@fpt.edu.vn' });
    outsider = await TestDatabase.createLecturer();
    instrument = await TestDatabase.createInstrument('Đàn tranh');
    classRecord = await TestDatabase.createClass(owner.id, instrument.id, { cohort: 'FA26' });
    await TestDatabase.addCoLecturer(classRecord.id, coLecturer.id, owner.id);
    ownerToken = TestDatabase.tokenFor(owner);
    coToken = TestDatabase.tokenFor(coLecturer);
    outsiderToken = TestDatabase.tokenFor(outsider);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('lets a co-lecturer list, read, update and end the class', async () => {
    const list = await request(app).get('/api/v1/classes').set('Authorization', coToken);
    expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual([classRecord.id]);
    expect(list.body.data.activeCount).toBe(1);
    expect(list.body.data.cohorts).toEqual([classRecord.cohort]);
    expect((await request(app).get(`/api/v1/classes/${classRecord.id}`).set('Authorization', coToken)).status).toBe(200);
    const updated = await request(app).patch(`/api/v1/classes/${classRecord.id}`).set('Authorization', coToken).send({ description: 'Mới' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.description).toBe('Mới');
    const ended = await request(app).post(`/api/v1/classes/${classRecord.id}/end`).set('Authorization', coToken);
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe('ENDED');
  });

  it('still hides the class from an unrelated lecturer', async () => {
    expect((await request(app).get(`/api/v1/classes/${classRecord.id}`).set('Authorization', outsiderToken)).status).toBe(404);
    const list = await request(app).get('/api/v1/classes').set('Authorization', outsiderToken);
    expect(list.body.data.items).toEqual([]);
    expect((await request(app).patch(`/api/v1/classes/${classRecord.id}`).set('Authorization', outsiderToken).send({ description: 'Mới' })).status).toBe(404);
  });

  it('lets a co-lecturer add a student to the class', async () => {
    const response = await request(app).post(`/api/v1/classes/${classRecord.id}/members`).set('Authorization', coToken)
      .send({ email: 'sv.moi@fpt.edu.vn', fullName: 'Sinh Viên Mới', studentCode: 'SE999999' });
    expect(response.status).toBe(201);
  });

  const createBody = (coLecturerIds: string[]) => ({ name: `Lớp ${TestDatabase.nextId()}`, cohort: 'FA26', instrumentId: instrument.id, coLecturerIds });

  it('creates a class with co-lecturers, deduplicated, and returns them in detail', async () => {
    const response = await request(app).post('/api/v1/classes').set('Authorization', ownerToken).send(createBody([coLecturer.id, coLecturer.id]));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      owner: { id: owner.id, email: owner.email },
      coLecturers: [{ id: coLecturer.id, email: coLecturer.email }],
      isPrimaryLecturer: true
    });
    const asCo = await request(app).get(`/api/v1/classes/${response.body.data.id}`).set('Authorization', coToken);
    expect(asCo.body.data.isPrimaryLecturer).toBe(false);
  });

  it('rejects the owner, a student, a locked lecturer and an unknown id as co-lecturers', async () => {
    const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    const locked = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, status: 'LOCKED' });
    const send = (ids: string[]) => request(app).post('/api/v1/classes').set('Authorization', ownerToken).send(createBody(ids));
    const ownerResponse = await send([owner.id]);
    expect(ownerResponse.status).toBe(400);
    expect(ownerResponse.body.errors[0]).toMatchObject({ field: 'coLecturerIds', message: 'Giảng viên chính không cần thêm làm giảng viên cùng dạy.' });
    for (const id of [student.id, locked.id, crypto.randomUUID()]) {
      const response = await send([id]);
      expect(response.status).toBe(400);
      expect(response.body.errors[0]).toMatchObject({ field: 'coLecturerIds', message: 'Giảng viên đã chọn không tồn tại hoặc đã bị khóa.' });
    }
  });

  it('accepts a PENDING lecturer as co-lecturer', async () => {
    const pending = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, status: 'PENDING' });
    const response = await request(app).post('/api/v1/classes').set('Authorization', ownerToken).send(createBody([pending.id]));
    expect(response.status).toBe(201);
    expect(response.body.data.coLecturers.map((item: Backend.LecturerDTO) => item.id)).toEqual([pending.id]);
  });

  it('looks up lecturers by email, case-insensitive and trimmed, excluding self, students and locked', async () => {
    const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT, email: 'gvcung.sv@fpt.edu.vn' });
    const locked = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, status: 'LOCKED', email: 'gvcung.locked@fpt.edu.vn' });
    const response = await request(app).get('/api/v1/classes/lecturers/lookup')
      .query({ email: '  GV  ' }).set('Authorization', ownerToken);
    expect(response.status).toBe(200);
    const ids = response.body.data.map((item: Backend.LecturerDTO) => item.id);
    expect(ids).toContain(coLecturer.id);
    for (const excluded of [owner.id, student.id, locked.id]) expect(ids).not.toContain(excluded);
    expect(response.body.data[0]).toEqual({ id: expect.any(String), fullName: expect.any(String), email: expect.any(String) });
  });

  const lecturersUrl = () => `/api/v1/classes/${classRecord.id}/lecturers`;

  it('lets the owner add and remove a co-lecturer, with audit', async () => {
    const added = await request(app).post(lecturersUrl()).set('Authorization', ownerToken).send({ lecturerId: outsider.id });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ id: outsider.id, email: outsider.email });
    expect((await request(app).post(lecturersUrl()).set('Authorization', ownerToken).send({ lecturerId: outsider.id })).status).toBe(409);
    const removed = await request(app).delete(`${lecturersUrl()}/${outsider.id}`).set('Authorization', ownerToken);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toBeNull();
    expect(await TestDatabase.prisma.auditLog.count({ where: { action: { in: ['CLASS_LECTURER_ADD', 'CLASS_LECTURER_REMOVE'] } } })).toBe(2);
    expect((await request(app).delete(`${lecturersUrl()}/${outsider.id}`).set('Authorization', ownerToken)).status).toBe(404);
  });

  it('forbids a co-lecturer from managing lecturers and hides the class from outsiders', async () => {
    const asCo = await request(app).post(lecturersUrl()).set('Authorization', coToken).send({ lecturerId: outsider.id });
    expect(asCo.status).toBe(403);
    expect(asCo.body.message).toBe('Chỉ giảng viên chính được quản lý giảng viên cùng dạy.');
    expect((await request(app).delete(`${lecturersUrl()}/${coLecturer.id}`).set('Authorization', coToken)).status).toBe(403);
    expect((await request(app).post(lecturersUrl()).set('Authorization', outsiderToken).send({ lecturerId: outsider.id })).status).toBe(404);
  });

  it('blocks lecturer changes on an ended class and rejects the owner / locked accounts', async () => {
    const locked = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, status: 'LOCKED' });
    const ownerResponse = await request(app).post(lecturersUrl()).set('Authorization', ownerToken).send({ lecturerId: owner.id });
    expect(ownerResponse.status).toBe(400);
    expect(ownerResponse.body.errors[0].message).toBe('Giảng viên chính không cần thêm làm giảng viên cùng dạy.');
    const lockedResponse = await request(app).post(lecturersUrl()).set('Authorization', ownerToken).send({ lecturerId: locked.id });
    expect(lockedResponse.status).toBe(400);
    expect(lockedResponse.body.errors[0].message).toBe('Giảng viên đã chọn không tồn tại hoặc đã bị khóa.');
    await TestDatabase.prisma.class.update({ where: { id: classRecord.id }, data: { status: 'ENDED' } });
    expect((await request(app).post(lecturersUrl()).set('Authorization', ownerToken).send({ lecturerId: outsider.id })).status).toBe(409);
    expect((await request(app).delete(`${lecturersUrl()}/${coLecturer.id}`).set('Authorization', ownerToken)).status).toBe(409);
  });
});

describe('co-lecturer access across modules', () => {
  let classRecord: Awaited<ReturnType<typeof TestDatabase.createClass>>;
  let owner: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let coLecturer: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let outsider: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let instrument: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;
  let assignment: Awaited<ReturnType<typeof TestDatabase.createAssignment>>;
  let submission: Awaited<ReturnType<typeof TestDatabase.createSubmission>>;
  let ownerToken: string;
  let coToken: string;
  let outsiderToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    owner = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, email: 'gv.chinh2@fpt.edu.vn' });
    coLecturer = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, email: 'gvcung.day2@fpt.edu.vn' });
    outsider = await TestDatabase.createLecturer();
    instrument = await TestDatabase.createInstrument('Đàn tranh');
    classRecord = await TestDatabase.createClass(owner.id, instrument.id, { cohort: 'FA26', startDate: TestDatabase.futureDate(-3) });
    await TestDatabase.addCoLecturer(classRecord.id, coLecturer.id, owner.id);
    const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    await TestDatabase.addMember(classRecord.id, student.id, owner.id);
    assignment = await TestDatabase.createAssignment(classRecord.id, owner.id, { title: 'Độc tấu' });
    submission = await TestDatabase.createSubmission(assignment.id, student.id);
    ownerToken = TestDatabase.tokenFor(owner);
    coToken = TestDatabase.tokenFor(coLecturer);
    outsiderToken = TestDatabase.tokenFor(outsider);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('lets a co-lecturer manage assignments, comment, see progress and review', async () => {
    expect((await request(app).get('/api/v1/assignments').set('Authorization', coToken)).body.data.items).toHaveLength(1);
    expect((await request(app).get(`/api/v1/assignments/${assignment.id}`).set('Authorization', coToken)).status).toBe(200);
    expect((await request(app).put(`/api/v1/submissions/${submission.id}/comment`).set('Authorization', coToken).send({ content: 'Tốt' })).status).toBeLessThan(300);
    expect((await request(app).get('/api/v1/classes/owned').set('Authorization', coToken)).body.data.map((item: { id: string }) => item.id)).toContain(classRecord.id);
    expect((await request(app).get(`/api/v1/classes/${classRecord.id}/progress`).set('Authorization', coToken)).status).toBe(200);
    expect((await request(app).get(`/api/v1/submissions/${submission.id}/review`).set('Authorization', coToken)).status).toBe(200);
  });

  it('keeps assignments hidden from an outsider', async () => {
    expect((await request(app).get('/api/v1/assignments').set('Authorization', outsiderToken)).body.data.items).toHaveLength(0);
    expect((await request(app).get(`/api/v1/assignments/${assignment.id}`).set('Authorization', outsiderToken)).status).toBe(404);
    expect((await request(app).put(`/api/v1/submissions/${submission.id}/comment`).set('Authorization', outsiderToken).send({ content: 'x' })).status).toBe(404);
    expect((await request(app).get(`/api/v1/classes/${classRecord.id}/progress`).set('Authorization', outsiderToken)).status).toBe(403);
    expect((await request(app).get(`/api/v1/submissions/${submission.id}/review`).set('Authorization', outsiderToken)).status).toBe(403);
  });

  it('revokes access right after removal', async () => {
    await request(app).delete(`/api/v1/classes/${classRecord.id}/lecturers/${coLecturer.id}`).set('Authorization', ownerToken);
    expect((await request(app).get(`/api/v1/classes/${classRecord.id}`).set('Authorization', coToken)).status).toBe(404);
    expect((await request(app).get(`/api/v1/assignments/${assignment.id}`).set('Authorization', coToken)).status).toBe(404);
    expect((await request(app).get(`/api/v1/classes/${classRecord.id}/progress`).set('Authorization', coToken)).status).not.toBe(200);
    expect((await request(app).put(`/api/v1/submissions/${submission.id}/comment`).set('Authorization', coToken).send({ content: 'x' })).status).toBe(404);
  });

  it('lets a co-lecturer reject a submission in review, but not an outsider', async () => {
    const body = { decision: 'REJECT', reason: 'Chưa đạt yêu cầu' };
    expect((await request(app).post(`/api/v1/submissions/${submission.id}/review`).set('Authorization', outsiderToken).send(body)).status).toBe(403);
    expect((await request(app).post(`/api/v1/submissions/${submission.id}/review`).set('Authorization', coToken).send(body)).status).toBe(200);
  });

  it('lets a co-lecturer reference the class in a challenge draft, but not an outsider', async () => {
    const body = { title: 'Thử thách nháp', instrumentId: instrument.id, classIds: [classRecord.id], publish: false };
    expect((await request(app).post('/api/v1/lecturer/challenges').set('Authorization', coToken).send(body)).status).toBe(201);
    expect((await request(app).post('/api/v1/lecturer/challenges').set('Authorization', outsiderToken).send(body)).status).toBe(404);
  });

  it('blocks an admin role change while the lecturer co-teaches an active class', async () => {
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    const response = await request(app).patch(`/api/v1/users/${coLecturer.id}`).set('Authorization', TestDatabase.tokenFor(admin)).send({ role: TestDatabase.roles.STUDENT });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Không thể đổi vai trò của giảng viên đang phụ trách lớp học.');
  });
});
