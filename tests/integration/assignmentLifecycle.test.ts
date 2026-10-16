import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Assignment lifecycle (lecturer)', () => {
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

  const create = (body: object, token: string = lecturerToken) => request(app).post('/api/v1/assignments').set('Authorization', token).send(body);
  const base = () => ({ classId: classRecord.id, title: 'Luyện Lý ngựa ô', kind: 'SOLO', publish: false });
  const countNotifications = () => TestDatabase.prisma.notification.count();

  it('creates a draft without notifications', async () => {
    const member = await TestDatabase.createUser();
    await TestDatabase.addMember(classRecord.id, member.id, lecturer.id);
    const response = await create({ ...base(), description: '  Tập chậm  ' });
    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Tạo bài tập thành công.');
    expect(response.body.data).toMatchObject({ status: 'DRAFT', version: 1, title: 'Luyện Lý ngựa ô', kind: 'SOLO', description: 'Tập chậm', requiredBpm: null, piece: null });
    expect(await countNotifications()).toBe(0);
  });

  it('creates and publishes, notifying active members only', async () => {
    const first = await TestDatabase.createUser();
    const second = await TestDatabase.createUser();
    const removed = await TestDatabase.createUser();
    await TestDatabase.addMember(classRecord.id, first.id, lecturer.id);
    await TestDatabase.addMember(classRecord.id, second.id, lecturer.id);
    const removedMembership = await TestDatabase.addMember(classRecord.id, removed.id, lecturer.id);
    await TestDatabase.prisma.classMember.update({ where: { id: removedMembership.id }, data: { removedAt: new Date() } });

    const response = await create({ ...base(), publish: true });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('PUBLISHED');
    const notifications = await TestDatabase.prisma.notification.findMany();
    expect(notifications.map((item) => item.userId).sort()).toEqual([first.id, second.id].sort());
    expect(notifications[0]).toMatchObject({ title: 'Bài tập mới', body: 'TRD301 · Luyện Lý ngựa ô', link: `/student/assignments/${response.body.data.id}` });
  });

  it('validates title, description, kind and bpm', async () => {
    const response = await create({ ...base(), title: '  ', description: 'x'.repeat(1001), kind: 'RUBRIC', requiredBpm: 0 });
    expect(response.status).toBe(400);
    const byField = Object.fromEntries(response.body.errors.map((error: { field: string; message: string }) => [error.field, error.message]));
    expect(byField).toMatchObject({
      title: 'Tiêu đề không được để trống.',
      description: 'Mô tả không được vượt quá 1000 ký tự.',
      requiredBpm: 'BPM yêu cầu phải nằm trong khoảng từ 1 đến 300.'
    });
    expect(byField.kind).toBeDefined();
    expect((await create({ ...base(), requiredBpm: 301 })).body.errors[0]).toMatchObject({ field: 'requiredBpm', message: 'BPM yêu cầu phải nằm trong khoảng từ 1 đến 300.' });
    expect((await create({ ...base(), requiredBpm: 300, title: 'x'.repeat(200) })).status).toBe(201);
  });

  it('rejects a piece of another instrument or hidden piece with MSG-48', async () => {
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    const otherPiece = await TestDatabase.createPiece(bau.id);
    const hiddenPiece = await TestDatabase.createPiece(tranh.id, { isVisible: false });
    for (const pieceId of [otherPiece.id, hiddenPiece.id]) {
      const response = await create({ ...base(), pieceId });
      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([{ field: 'pieceId', code: 'MSG-48', message: 'Bài nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.' }]);
    }
    const song = await TestDatabase.createPiece(tranh.id, { title: 'Lý ngựa ô', kind: 'SONG' });
    expect((await create({ ...base(), pieceId: song.id })).body.data.piece).toMatchObject({ id: song.id, title: 'Lý ngựa ô', isAvailable: true });
  });

  it('editing creates version 2 and notifies only when published', async () => {
    const member = await TestDatabase.createUser();
    await TestDatabase.addMember(classRecord.id, member.id, lecturer.id);
    const draft = (await create(base())).body.data;
    const draftEdit = await request(app).put(`/api/v1/assignments/${draft.id}`).set('Authorization', lecturerToken).send({ title: 'Bản nháp 2', kind: 'OTHER' });
    expect(draftEdit.status).toBe(200);
    expect(draftEdit.body.data).toMatchObject({ version: 2, title: 'Bản nháp 2', kind: 'OTHER', status: 'DRAFT' });
    expect(await countNotifications()).toBe(0);

    await request(app).post(`/api/v1/assignments/${draft.id}/publish`).set('Authorization', lecturerToken).expect(200);
    const published = await request(app).put(`/api/v1/assignments/${draft.id}`).set('Authorization', lecturerToken).send({ title: 'Bản 3', kind: 'OTHER', requiredBpm: 90 });
    expect(published.body.message).toBe('Cập nhật bài tập thành công.');
    expect(published.body.data).toMatchObject({ version: 3, requiredBpm: 90 });
    const titles = (await TestDatabase.prisma.notification.findMany({ orderBy: { createdAt: 'asc' } })).map((item) => item.title);
    expect(titles).toEqual(['Bài tập mới', 'Bài tập đã được cập nhật']);
    expect(await TestDatabase.prisma.assignmentVersion.count({ where: { assignmentId: draft.id } })).toBe(3);
  });

  it('editing with a hidden piece returns MSG-48', async () => {
    const piece = await TestDatabase.createPiece(tranh.id);
    const created = (await create({ ...base(), pieceId: piece.id })).body.data;
    await TestDatabase.prisma.piece.update({ where: { id: piece.id }, data: { isVisible: false } });
    const response = await request(app).put(`/api/v1/assignments/${created.id}`).set('Authorization', lecturerToken).send({ title: 'Sửa', kind: 'SOLO', pieceId: piece.id });
    expect(response.status).toBe(400);
    expect(response.body.errors[0]).toMatchObject({ field: 'pieceId', code: 'MSG-48' });
  });

  it('closed assignment can still be edited', async () => {
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { status: 'CLOSED' });
    const response = await request(app).put(`/api/v1/assignments/${assignment.id}`).set('Authorization', lecturerToken).send({ title: 'Sửa khi đóng', kind: 'BONUS' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'CLOSED', version: 2, kind: 'BONUS' });
  });

  it('publish only from draft; close only from published; reopen only from closed (409 otherwise)', async () => {
    const id = (await create(base())).body.data.id;
    const action = (name: string) => request(app).post(`/api/v1/assignments/${id}/${name}`).set('Authorization', lecturerToken);
    expect((await action('close')).status).toBe(409);
    expect((await action('reopen')).status).toBe(409);
    const published = await action('publish');
    expect(published.body).toMatchObject({ message: 'Đăng bài tập thành công.', data: { status: 'PUBLISHED' } });
    expect((await action('publish')).status).toBe(409);
    expect((await action('close')).body).toMatchObject({ message: 'Đóng bài tập thành công.', data: { status: 'CLOSED' } });
    expect((await action('reopen')).body).toMatchObject({ message: 'Mở lại bài tập thành công.', data: { status: 'PUBLISHED' } });
  });

  it('soft delete hides the assignment (404 afterwards)', async () => {
    const id = (await create(base())).body.data.id;
    const deleted = await request(app).delete(`/api/v1/assignments/${id}`).set('Authorization', lecturerToken);
    expect(deleted.status).toBe(200);
    expect(deleted.body.message).toBe('Xóa bài tập thành công.');
    expect((await TestDatabase.prisma.assignment.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect((await request(app).put(`/api/v1/assignments/${id}`).set('Authorization', lecturerToken).send({ title: 'x', kind: 'SOLO' })).status).toBe(404);
    expect((await request(app).post(`/api/v1/assignments/${id}/publish`).set('Authorization', lecturerToken)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/assignments/${id}`).set('Authorization', lecturerToken)).status).toBe(404);
  });

  it('ending the class closes published assignments and blocks writes', async () => {
    const published = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { status: 'PUBLISHED' });
    const draft = await TestDatabase.createAssignment(classRecord.id, lecturer.id, { status: 'DRAFT' });
    await request(app).post(`/api/v1/classes/${classRecord.id}/end`).set('Authorization', lecturerToken).expect(200);

    expect((await TestDatabase.prisma.assignment.findUniqueOrThrow({ where: { id: published.id } })).status).toBe('CLOSED');
    expect((await TestDatabase.prisma.assignment.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');
    const writes = await Promise.all([
      create(base()),
      request(app).put(`/api/v1/assignments/${draft.id}`).set('Authorization', lecturerToken).send({ title: 'x', kind: 'SOLO' }),
      request(app).post(`/api/v1/assignments/${draft.id}/publish`).set('Authorization', lecturerToken),
      request(app).post(`/api/v1/assignments/${published.id}/reopen`).set('Authorization', lecturerToken),
      request(app).delete(`/api/v1/assignments/${draft.id}`).set('Authorization', lecturerToken)
    ]);
    for (const write of writes) {
      expect(write.status).toBe(409);
      expect(write.body.code).toBe('MSG-08');
    }
  });

  it('another lecturer gets 404, student gets 403', async () => {
    const id = (await create(base())).body.data.id;
    const otherToken = TestDatabase.tokenFor(await TestDatabase.createLecturer());
    expect((await request(app).put(`/api/v1/assignments/${id}`).set('Authorization', otherToken).send({ title: 'x', kind: 'SOLO' })).status).toBe(404);
    expect((await create(base(), otherToken)).status).toBe(404);
    const studentToken = TestDatabase.tokenFor(await TestDatabase.createUser());
    expect((await create(base(), studentToken)).status).toBe(403);
  });

  it('writes audit rows', async () => {
    const id = (await create(base())).body.data.id;
    await request(app).post(`/api/v1/assignments/${id}/publish`).set('Authorization', lecturerToken);
    await request(app).post(`/api/v1/assignments/${id}/close`).set('Authorization', lecturerToken);
    const actions = (await TestDatabase.prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })).map((row) => row.action);
    expect(actions).toEqual(['ASSIGNMENT_CREATE', 'ASSIGNMENT_PUBLISH', 'ASSIGNMENT_CLOSE']);
  });
});
