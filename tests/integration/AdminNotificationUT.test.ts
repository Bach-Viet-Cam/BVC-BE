import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

type NotificationInput = {
  title: string;
  body: string;
  type: 'DEADLINE' | 'ANNOUNCEMENT' | 'SYSTEM' | 'BONUS';
  target: 'ALL' | 'STUDENT' | 'TEACHER';
  action: 'draft' | 'send';
  scheduledAt?: string;
};

describe('Admin notifications (console)', () => {
  let adminToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const payload = (overrides: Partial<NotificationInput> = {}): NotificationInput => ({
    title: 'Thông báo kiểm thử',
    body: 'Nội dung thông báo kiểm thử',
    type: 'ANNOUNCEMENT',
    target: 'STUDENT',
    action: 'draft',
    ...overrides
  });

  const create = (input: NotificationInput) =>
    request(app).post('/api/v1/admin/notifications').set('Authorization', adminToken).send(input);

  it('ITC008 - Admin gửi thông báo ngay', async () => {
    const firstStudent = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT, status: 'ACTIVE' });
    const secondStudent = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT, status: 'ACTIVE' });

    const response = await create(payload({ title: 'Thông báo khẩn', action: 'send' }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, message: 'Đã gửi thông báo.' });
    expect(response.body.data).toMatchObject({ title: 'Thông báo khẩn', status: 'SENT', recipientCount: 2 });

    for (const student of [firstStudent, secondStudent]) {
      const inbox = await request(app).get('/api/v1/me/notifications').set('Authorization', TestDatabase.tokenFor(student));
      expect(inbox.status).toBe(200);
      expect(inbox.body.data.items).toEqual([
        expect.objectContaining({ title: 'Thông báo khẩn', type: 'ANNOUNCEMENT', isRead: false })
      ]);
    }
  });

  it('ITC009 - Admin liệt kê và sửa thông báo chưa gửi', async () => {
    const draft = await create(payload({ title: 'Nháp ban đầu' }));
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ message: 'Đã lưu nháp thông báo.', data: { status: 'DRAFT' } });
    const id = draft.body.data.id as string;

    const list = await request(app).get('/api/v1/admin/notifications?status=DRAFT').set('Authorization', adminToken);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toEqual([expect.objectContaining({ id, title: 'Nháp ban đầu', status: 'DRAFT' })]);

    const patch = await request(app)
      .patch(`/api/v1/admin/notifications/${id}`)
      .set('Authorization', adminToken)
      .send(payload({ title: 'Nháp đã sửa' }));
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ message: 'Đã lưu nháp thông báo.', data: { id, title: 'Nháp đã sửa', status: 'DRAFT' } });

    const persisted = await TestDatabase.prisma.notification.findUniqueOrThrow({ where: { id } });
    expect(persisted.title).toBe('Nháp đã sửa');
    expect(persisted.status).toBe('DRAFT');
  });

  it('ITC010 - Vòng đời gửi hẹn giờ rồi xóa', async () => {
    const futureDate = TestDatabase.futureDate(2);
    const draft = await create(payload({ title: 'Lịch gửi', scheduledAt: `${futureDate}T09:00:00+07:00` }));
    expect(draft.status).toBe(201);
    expect(draft.body.data).toMatchObject({ status: 'DRAFT' });
    const id = draft.body.data.id as string;

    const schedule = await request(app)
      .patch(`/api/v1/admin/notifications/${id}`)
      .set('Authorization', adminToken)
      .send(payload({ title: 'Lịch gửi đã đổi', action: 'send', scheduledAt: `${futureDate}T10:00:00+07:00` }));
    expect(schedule.status).toBe(200);
    expect(schedule.body).toMatchObject({ message: 'Đã hẹn giờ gửi thông báo.', data: { status: 'SCHEDULED' } });

    const sent = await request(app).post(`/api/v1/admin/notifications/${id}/send`).set('Authorization', adminToken);
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ message: 'Đã gửi thông báo.', data: { status: 'SENT' } });

    const removed = await request(app).delete(`/api/v1/admin/notifications/${id}`).set('Authorization', adminToken);
    expect(removed.status).toBe(409);
    expect(removed.body.message).toBe('Thông báo đã gửi, không thể sửa hoặc xóa.');
  });
});
