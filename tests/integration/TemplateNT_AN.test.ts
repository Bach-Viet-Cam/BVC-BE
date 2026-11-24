import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import NotificationDispatchService from '../../src/modules/platform/service/NotificationDispatchService.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

type NotificationInput = {
  title: string;
  body: string;
  type: 'DEADLINE' | 'ANNOUNCEMENT' | 'SYSTEM' | 'BONUS';
  target: 'ALL' | 'STUDENT' | 'TEACHER';
  action: 'draft' | 'send';
  scheduledAt?: string | null;
};

const payload = (overrides: Partial<NotificationInput> = {}): NotificationInput => ({
  title: 'Thông báo kiểm thử',
  body: 'Nội dung thông báo kiểm thử',
  type: 'ANNOUNCEMENT',
  target: 'STUDENT',
  action: 'draft',
  ...overrides
});

const futureSchedule = (): string => `${TestDatabase.futureDate(2)}T09:00:00+07:00`;
const pastSchedule = (): string => `${TestDatabase.futureDate(-1)}T09:00:00+07:00`;

describe('Template NT/AN - Platform notifications', () => {
  let adminToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const create = (input: NotificationInput) =>
    request(app).post('/api/v1/admin/notifications').set('Authorization', adminToken).send(input);

  describe('My Notifications', () => {
    let studentToken: string;
    let teacherToken: string;

    beforeEach(async () => {
      studentToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT }));
      teacherToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER }));
    });

    const inbox = (token: string, query: string = '') =>
      request(app).get(`/api/v1/me/notifications${query}`).set('Authorization', token);

    it('ITC-NT-008 - draft không vào inbox; gửi draft sau đó thì delivery xuất hiện', async () => {
      const draft = await create(payload({ title: 'Nháp chờ gửi', target: 'STUDENT' }));
      expect(draft.status).toBe(201);
      expect(draft.body.data).toMatchObject({ title: 'Nháp chờ gửi', status: 'DRAFT' });
      const id = draft.body.data.id as string;

      const beforeInbox = await inbox(studentToken);
      expect(beforeInbox.status).toBe(200);
      expect(beforeInbox.body.data).toMatchObject({ total: 0, unreadCount: 0 });

      const sent = await request(app).post(`/api/v1/admin/notifications/${id}/send`).set('Authorization', adminToken);
      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({ message: 'Đã gửi thông báo.', data: { status: 'SENT' } });

      const afterInbox = await inbox(studentToken);
      expect(afterInbox.body.data).toMatchObject({ total: 1, unreadCount: 1 });
      expect(afterInbox.body.data.items).toEqual([
        expect.objectContaining({ title: 'Nháp chờ gửi', isRead: false })
      ]);
    });

    it('ITC-NT-009 - scheduledAt quá khứ bị 400; tương lai lưu SCHEDULED; inbox chưa có; sau khi đến hạn thì có', async () => {
      const past = await create(payload({ title: 'Giờ quá khứ', action: 'send', scheduledAt: pastSchedule() }));
      expect(past.status).toBe(400);
      expect(past.body.message).toBe('Thời điểm hẹn giờ phải ở tương lai.');

      const scheduled = await create(payload({ title: 'Hẹn giờ gửi', action: 'send', scheduledAt: futureSchedule() }));
      expect(scheduled.status).toBe(201);
      expect(scheduled.body).toMatchObject({ message: 'Đã hẹn giờ gửi thông báo.', data: { status: 'SCHEDULED' } });
      const id = scheduled.body.data.id as string;
      expect((await inbox(studentToken)).body.data).toMatchObject({ total: 0, unreadCount: 0 });

      await TestDatabase.prisma.notification.update({
        where: { id },
        data: { scheduledAt: new Date(Date.now() - 60_000) }
      });
      await NotificationDispatchService.tick();

      const afterInbox = await inbox(studentToken);
      expect(afterInbox.body.data).toMatchObject({ total: 1, unreadCount: 1 });
      expect(afterInbox.body.data.items).toEqual([
        expect.objectContaining({ title: 'Hẹn giờ gửi', isRead: false })
      ]);
      const persisted = await TestDatabase.prisma.notification.findUniqueOrThrow({ where: { id } });
      expect(persisted.status).toBe('SENT');
    });

    it('ITC-NT-011 - sửa/xoá draft; id lạ trả 404', async () => {
      const created = await create(payload({ title: 'Nháp gốc' }));
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;

      const patched = await request(app)
        .patch(`/api/v1/admin/notifications/${id}`)
        .set('Authorization', adminToken)
        .send(payload({ title: 'Nháp sau sửa' }));
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({
        message: 'Đã lưu nháp thông báo.',
        data: { id, title: 'Nháp sau sửa', status: 'DRAFT' }
      });

      const removed = await request(app).delete(`/api/v1/admin/notifications/${id}`).set('Authorization', adminToken);
      expect(removed.status).toBe(200);
      expect(removed.body).toMatchObject({ message: 'Đã xóa thông báo.', data: { id } });
      expect(await TestDatabase.prisma.notification.count({ where: { id } })).toBe(0);

      const missing = 'id-khong-ton-tai';
      const missingPatch = await request(app)
        .patch(`/api/v1/admin/notifications/${missing}`)
        .set('Authorization', adminToken)
        .send(payload());
      expect(missingPatch.status).toBe(404);
      expect(missingPatch.body.message).toBe('Không tìm thấy thông báo.');

      const missingDelete = await request(app).delete(`/api/v1/admin/notifications/${missing}`).set('Authorization', adminToken);
      expect(missingDelete.status).toBe(404);
      expect(missingDelete.body.message).toBe('Không tìm thấy thông báo.');
    });

    it('ITC-NT-013 - validate title >150, body >2000, field lạ (strict)', async () => {
      const longTitle = await create(payload({ title: 'a'.repeat(151) }));
      expect(longTitle.status).toBe(400);
      expect(longTitle.body.errors[0].field).toBe('title');

      const longBody = await create(payload({ body: 'b'.repeat(2001) }));
      expect(longBody.status).toBe(400);
      expect(longBody.body.errors[0].field).toBe('body');

      const unknownField = await request(app)
        .post('/api/v1/admin/notifications')
        .set('Authorization', adminToken)
        .send({ ...payload(), unknownField: 'x' });
      expect(unknownField.status).toBe(400);
      expect(unknownField.body.errors[0].field).toBe('');
      expect(unknownField.body).not.toHaveProperty('field');
    });

    it('ITC-NT-014 - chỉ Admin dùng được API /admin/notifications: Guest 401, Teacher/Student 403', async () => {
      const guest = await request(app).get('/api/v1/admin/notifications');
      expect(guest.status).toBe(401);
      expect(guest.body.message).toBe('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

      for (const token of [teacherToken, studentToken]) {
        const forbidden = await request(app).get('/api/v1/admin/notifications').set('Authorization', token);
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.message).toBe('Bạn không có quyền truy cập chức năng này.');
      }

      const allowed = await request(app).get('/api/v1/admin/notifications').set('Authorization', adminToken);
      expect(allowed.status).toBe(200);
    });

    it('ITC-NT-015 - validate query inbox: type sai, pageSize >100 → 400', async () => {
      const badType = await inbox(studentToken, '?type=INVALID');
      expect(badType.status).toBe(400);
      expect(badType.body.errors[0].field).toBe('type');

      const bigPageSize = await inbox(studentToken, '?pageSize=101');
      expect(bigPageSize.status).toBe(400);
      expect(bigPageSize.body.errors[0].field).toBe('pageSize');
    });

    it('ITC-NT-016 - Teacher và Admin cũng có inbox riêng', async () => {
      const send = async (title: string, target: NotificationInput['target']) => {
        const response = await create(payload({ title, target, action: 'send' }));
        expect(response.status).toBe(201);
      };
      await send('Thông báo chung', 'ALL');
      await send('Chỉ giảng viên', 'TEACHER');
      await send('Chỉ sinh viên', 'STUDENT');

      const teacherInbox = await inbox(teacherToken);
      expect(teacherInbox.status).toBe(200);
      expect(teacherInbox.body.data.items.map((item: { title: string }) => item.title)).toEqual([
        'Chỉ giảng viên',
        'Thông báo chung'
      ]);

      const adminInbox = await inbox(adminToken);
      expect(adminInbox.status).toBe(200);
      expect(adminInbox.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Thông báo chung']);

      const studentInbox = await inbox(studentToken);
      expect(studentInbox.body.data.items.map((item: { title: string }) => item.title)).toEqual([
        'Chỉ sinh viên',
        'Thông báo chung'
      ]);
    });

    it('ITC-NT-017 - đánh dấu đã đọc 2 lần giữ nguyên readAt; id lạ 404', async () => {
      const created = await create(payload({ title: 'Đọc hai lần', target: 'ALL', action: 'send' }));
      expect(created.status).toBe(201);
      const [delivery] = (await inbox(studentToken)).body.data.items;
      expect(delivery).toBeDefined();

      const first = await request(app)
        .patch(`/api/v1/me/notifications/${delivery.id}/read`)
        .set('Authorization', studentToken);
      expect(first.status).toBe(200);
      expect(first.body.data).toMatchObject({ id: delivery.id, isRead: true });
      const afterFirst = await TestDatabase.prisma.userNotification.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(afterFirst.isRead).toBe(true);
      expect(afterFirst.readAt).not.toBeNull();

      const second = await request(app)
        .patch(`/api/v1/me/notifications/${delivery.id}/read`)
        .set('Authorization', studentToken);
      expect(second.status).toBe(200);
      const afterSecond = await TestDatabase.prisma.userNotification.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(afterSecond.readAt?.getTime()).toBe(afterFirst.readAt?.getTime());

      const missing = await request(app)
        .patch('/api/v1/me/notifications/id-khong-ton-tai/read')
        .set('Authorization', studentToken);
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('Không tìm thấy thông báo.');
    });
  });

  describe('Admin Notifications', () => {
    it('ITC-AN-003 - PATCH scheduledAt quá khứ → 400 "Thời điểm hẹn giờ phải ở tương lai."', async () => {
      const draft = await create(payload({ title: 'Nháp hẹn giờ' }));
      expect(draft.status).toBe(201);
      const id = draft.body.data.id as string;

      const patch = await request(app)
        .patch(`/api/v1/admin/notifications/${id}`)
        .set('Authorization', adminToken)
        .send(payload({ title: 'Nháp hẹn giờ', action: 'send', scheduledAt: pastSchedule() }));
      expect(patch.status).toBe(400);
      expect(patch.body.message).toBe('Thời điểm hẹn giờ phải ở tương lai.');

      const persisted = await TestDatabase.prisma.notification.findUniqueOrThrow({ where: { id } });
      expect(persisted.status).toBe('DRAFT');
      expect(persisted.scheduledAt).toBeNull();
    });

    it('ITC-AN-006 - Guest 401 / Teacher 403 trên /admin/notifications', async () => {
      const guest = await request(app).post('/api/v1/admin/notifications').send(payload());
      expect(guest.status).toBe(401);
      expect(guest.body.message).toBe('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

      const teacher = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
      const forbidden = await request(app)
        .post('/api/v1/admin/notifications')
        .set('Authorization', TestDatabase.tokenFor(teacher))
        .send(payload());
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.message).toBe('Bạn không có quyền truy cập chức năng này.');
    });

    it('ITC-AN-009 - thông báo hẹn giờ được gửi đúng lúc', async () => {
      const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
      const created = await create(payload({
        title: 'Đến giờ gửi',
        target: 'STUDENT',
        action: 'send',
        scheduledAt: futureSchedule()
      }));
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      const beforeInbox = await request(app)
        .get('/api/v1/me/notifications')
        .set('Authorization', TestDatabase.tokenFor(student));
      expect(beforeInbox.body.data.total).toBe(0);

      await TestDatabase.prisma.notification.update({
        where: { id },
        data: { scheduledAt: new Date(Date.now() - 60_000) }
      });
      await NotificationDispatchService.tick();

      const deliveries = await TestDatabase.prisma.userNotification.findMany({
        where: { notificationId: id },
        select: { userId: true }
      });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].userId).toBe(student.id);
      const persisted = await TestDatabase.prisma.notification.findUniqueOrThrow({ where: { id } });
      expect(persisted.status).toBe('SENT');
      expect(persisted.recipientCount).toBe(1);
    });

    it('ITC-AN-010 - POST với scheduledAt quá khứ → 400, không lưu bản ghi', async () => {
      const response = await create(payload({
        title: 'Tạo với giờ quá khứ',
        action: 'send',
        scheduledAt: pastSchedule()
      }));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Thời điểm hẹn giờ phải ở tương lai.');
      expect(await TestDatabase.prisma.notification.count()).toBe(0);
    });

    it('ITC-AN-011 - validate body khi tạo (title/body/type/target/scheduledAt/field lạ)', async () => {
      const invalidCases: Array<{ overrides: Partial<NotificationInput>; field: string }> = [
        { overrides: { title: '' }, field: 'title' },
        { overrides: { body: '' }, field: 'body' },
        { overrides: { type: 'INVALID' as NotificationInput['type'] }, field: 'type' },
        { overrides: { target: 'INVALID' as NotificationInput['target'] }, field: 'target' },
        { overrides: { scheduledAt: 'khong-phai-ngay' }, field: 'scheduledAt' }
      ];
      for (const { overrides, field } of invalidCases) {
        const response = await create(payload(overrides));
        expect(response.status).toBe(400);
        expect(response.body.errors[0].field).toBe(field);
      }

      const unknownField = await request(app)
        .post('/api/v1/admin/notifications')
        .set('Authorization', adminToken)
        .send({ ...payload(), unknownField: 1 });
      expect(unknownField.status).toBe(400);
      expect(unknownField.body.errors[0].field).toBe('');
      expect(unknownField.body).not.toHaveProperty('field');
      expect(await TestDatabase.prisma.notification.count()).toBe(0);
    });

    it('ITC-AN-012 - target ALL chỉ tới tài khoản không LOCKED', async () => {
      const active = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT, status: 'ACTIVE' });
      const locked = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT, status: 'LOCKED' });

      const created = await create(payload({ title: 'Cho tài khoản hoạt động', target: 'ALL', action: 'send' }));
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe('SENT');
      const id = created.body.data.id as string;

      const deliveries = await TestDatabase.prisma.userNotification.findMany({
        where: { notificationId: id },
        select: { userId: true }
      });
      const userIds = deliveries.map((delivery) => delivery.userId);
      expect(userIds).toContain(active.id);
      expect(userIds).not.toContain(locked.id);
      expect(userIds).toHaveLength(2);
      expect(created.body.data.recipientCount).toBe(2);
    });

    it('ITC-AN-013 - gửi một draft bằng cách PATCH kèm action: send', async () => {
      const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
      const draft = await create(payload({ title: 'Nháp sẽ gửi', target: 'STUDENT' }));
      expect(draft.status).toBe(201);
      const id = draft.body.data.id as string;

      const sent = await request(app)
        .patch(`/api/v1/admin/notifications/${id}`)
        .set('Authorization', adminToken)
        .send(payload({ title: 'Nháp sẽ gửi', target: 'STUDENT', action: 'send' }));
      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({ message: 'Đã gửi thông báo.', data: { id, status: 'SENT' } });

      const inbox = await request(app)
        .get('/api/v1/me/notifications')
        .set('Authorization', TestDatabase.tokenFor(student));
      expect(inbox.body.data.items).toEqual([
        expect.objectContaining({ title: 'Nháp sẽ gửi', isRead: false })
      ]);
    });

    it('ITC-AN-014 - id không tồn tại trên PATCH / send / DELETE → 404', async () => {
      const missing = 'id-khong-ton-tai';

      const patch = await request(app)
        .patch(`/api/v1/admin/notifications/${missing}`)
        .set('Authorization', adminToken)
        .send(payload());
      expect(patch.status).toBe(404);
      expect(patch.body.message).toBe('Không tìm thấy thông báo.');

      const send = await request(app)
        .post(`/api/v1/admin/notifications/${missing}/send`)
        .set('Authorization', adminToken);
      expect(send.status).toBe(404);
      expect(send.body.message).toBe('Không tìm thấy thông báo.');

      const remove = await request(app)
        .delete(`/api/v1/admin/notifications/${missing}`)
        .set('Authorization', adminToken);
      expect(remove.status).toBe(404);
      expect(remove.body.message).toBe('Không tìm thấy thông báo.');
    });
  });
});
