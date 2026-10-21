import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('My notifications (inbox)', () => {
  let admin: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let student: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let studentToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    student = await TestDatabase.createUser();
    studentToken = TestDatabase.tokenFor(student);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const sendFromAdmin = async (title: string, type: 'DEADLINE' | 'ANNOUNCEMENT' | 'SYSTEM' | 'BONUS', target: 'ALL' | 'STUDENT' | 'TEACHER' = 'ALL') => {
    const response = await request(app)
      .post('/api/v1/admin/notifications')
      .set('Authorization', TestDatabase.tokenFor(admin))
      .send({ title, body: `${title} – nội dung`, type, target, action: 'send' });
    expect(response.status).toBe(201);
  };

  const inbox = (query: string = '', token: string = studentToken) => request(app).get(`/api/v1/me/notifications${query}`).set('Authorization', token);

  it('lists own deliveries newest first with unread count and filters', async () => {
    await sendFromAdmin('Bảo trì tối nay', 'SYSTEM');
    await sendFromAdmin('Hạn nộp tuần 4', 'DEADLINE', 'STUDENT');
    await sendFromAdmin('Chỉ cho giảng viên', 'ANNOUNCEMENT', 'TEACHER');

    const all = await inbox();
    expect(all.status).toBe(200);
    expect(all.body.data).toMatchObject({ total: 2, page: 1, unreadCount: 2 });
    expect(all.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Hạn nộp tuần 4', 'Bảo trì tối nay']);
    expect(all.body.data.items[0]).toMatchObject({ type: 'DEADLINE', isRead: false, link: null });

    const deadlines = await inbox('?type=DEADLINE');
    expect(deadlines.body.data.items).toHaveLength(1);
    const paged = await inbox('?page=2&pageSize=1');
    expect(paged.body.data.items[0].title).toBe('Bảo trì tối nay');
  });

  it('marks one or all as read; unreadOnly hides read ones', async () => {
    await sendFromAdmin('Thông báo A', 'ANNOUNCEMENT');
    await sendFromAdmin('Thông báo B', 'BONUS');
    const [latest] = (await inbox()).body.data.items;

    const read = await request(app).patch(`/api/v1/me/notifications/${latest.id}/read`).set('Authorization', studentToken);
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ id: latest.id, isRead: true });
    expect((await request(app).get('/api/v1/me/notifications/unread-count').set('Authorization', studentToken)).body.data).toEqual({ count: 1 });
    expect((await inbox('?unreadOnly=true')).body.data.items.map((item: { title: string }) => item.title)).toEqual(['Thông báo A']);

    const readAll = await request(app).patch('/api/v1/me/notifications/read-all').set('Authorization', studentToken);
    expect(readAll.body).toMatchObject({ message: 'Đã đánh dấu tất cả thông báo là đã đọc.', data: { updated: 1 } });
    expect((await inbox()).body.data.unreadCount).toBe(0);
  });

  it("cannot read another user's delivery (404) and requires sign-in (401)", async () => {
    await sendFromAdmin('Riêng tư', 'ANNOUNCEMENT');
    const [delivery] = (await inbox()).body.data.items;
    const otherToken = TestDatabase.tokenFor(await TestDatabase.createUser());
    expect((await request(app).patch(`/api/v1/me/notifications/${delivery.id}/read`).set('Authorization', otherToken)).status).toBe(404);
    expect((await request(app).get('/api/v1/me/notifications')).status).toBe(401);
  });
});
