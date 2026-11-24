import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

type InboxUser = Awaited<ReturnType<typeof TestDatabase.createUser>>;

describe('My notifications (inbox per role)', () => {
  let adminToken: string;
  let student: InboxUser;
  let studentToken: string;
  let teacher: InboxUser;
  let teacherToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
    student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    studentToken = TestDatabase.tokenFor(student);
    teacher = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    teacherToken = TestDatabase.tokenFor(teacher);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const send = async (title: string, type: 'DEADLINE' | 'ANNOUNCEMENT' | 'SYSTEM' | 'BONUS', target: 'ALL' | 'STUDENT' | 'TEACHER') => {
    const response = await request(app)
      .post('/api/v1/admin/notifications')
      .set('Authorization', adminToken)
      .send({ title, body: `${title} - nội dung`, type, target, action: 'send' });
    expect(response.status).toBe(201);
  };

  const inbox = (token: string, query: string = '') => request(app).get(`/api/v1/me/notifications${query}`).set('Authorization', token);

  it('ITC011 - Hộp thư liệt kê theo thứ tự mới nhất và lọc', async () => {
    await send('Bảo trì tối nay', 'SYSTEM', 'ALL');
    await send('Hạn nộp tuần 4', 'DEADLINE', 'STUDENT');
    await send('Chỉ cho giảng viên', 'ANNOUNCEMENT', 'TEACHER');

    const all = await inbox(studentToken);
    expect(all.status).toBe(200);
    expect(all.body.data).toMatchObject({ total: 2, page: 1, unreadCount: 2 });
    expect(all.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Hạn nộp tuần 4', 'Bảo trì tối nay']);
    expect(all.body.data.items[0]).toMatchObject({ type: 'DEADLINE', isRead: false, link: null });

    const deadlines = await inbox(studentToken, '?type=DEADLINE');
    expect(deadlines.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Hạn nộp tuần 4']);

    const paged = await inbox(studentToken, '?page=2&pageSize=1');
    expect(paged.body.data).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(paged.body.data.items[0].title).toBe('Bảo trì tối nay');

    // Góc nhìn khác: giảng viên nhận ALL + TEACHER, không nhận STUDENT.
    const teacherInbox = await inbox(teacherToken);
    expect(teacherInbox.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Chỉ cho giảng viên', 'Bảo trì tối nay']);
  });

  it('ITC012 - Đánh dấu đã đọc một, tất cả và lọc unreadOnly', async () => {
    await send('Thông báo A', 'ANNOUNCEMENT', 'ALL');
    await send('Thông báo B', 'BONUS', 'ALL');
    const before = await inbox(studentToken);
    expect(before.body.data).toMatchObject({ total: 2, unreadCount: 2 });
    const [latest] = before.body.data.items;
    expect(latest.title).toBe('Thông báo B');

    const read = await request(app).patch(`/api/v1/me/notifications/${latest.id}/read`).set('Authorization', studentToken);
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ id: latest.id, title: 'Thông báo B', isRead: true });

    const unreadCount = await request(app).get('/api/v1/me/notifications/unread-count').set('Authorization', studentToken);
    expect(unreadCount.status).toBe(200);
    expect(unreadCount.body.data).toEqual({ count: 1 });

    const unreadOnly = await inbox(studentToken, '?unreadOnly=true');
    expect(unreadOnly.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Thông báo A']);

    const readAll = await request(app).patch('/api/v1/me/notifications/read-all').set('Authorization', studentToken);
    expect(readAll.status).toBe(200);
    expect(readAll.body).toMatchObject({ message: 'Đã đánh dấu tất cả thông báo là đã đọc.', data: { updated: 1 } });
    expect((await inbox(studentToken)).body.data.unreadCount).toBe(0);

    // Trạng thái đã đọc của student không ảnh hưởng giảng viên.
    expect((await inbox(teacherToken)).body.data.unreadCount).toBe(2);
  });

  it('ITC013 - Không đọc được delivery của người khác và cần đăng nhập', async () => {
    await send('Riêng tư', 'ANNOUNCEMENT', 'ALL');
    const [delivery] = (await inbox(studentToken)).body.data.items;

    const otherStudentToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT }));
    const otherStudentRead = await request(app)
      .patch(`/api/v1/me/notifications/${delivery.id}/read`)
      .set('Authorization', otherStudentToken);
    expect(otherStudentRead.status).toBe(404);
    expect(otherStudentRead.body.message).toBe('Không tìm thấy thông báo.');

    // Góc nhìn khác: giảng viên cũng không đọc được delivery của student.
    const teacherRead = await request(app)
      .patch(`/api/v1/me/notifications/${delivery.id}/read`)
      .set('Authorization', teacherToken);
    expect(teacherRead.status).toBe(404);

    const guest = await request(app).get('/api/v1/me/notifications');
    expect(guest.status).toBe(401);
  });

  it('ITC014 - Thông báo target TEACHER không lọt vào inbox student', async () => {
    await send('Thông báo chung', 'SYSTEM', 'ALL');
    await send('Hạn nộp cho sinh viên', 'DEADLINE', 'STUDENT');
    await send('Lịch họp giảng viên', 'ANNOUNCEMENT', 'TEACHER');

    const studentInbox = await inbox(studentToken);
    expect(studentInbox.status).toBe(200);
    expect(studentInbox.body.data).toMatchObject({ total: 2, unreadCount: 2 });
    expect(studentInbox.body.data.items.map((item: { title: string }) => item.title)).toEqual([
      'Hạn nộp cho sinh viên',
      'Thông báo chung'
    ]);

    const teacherInbox = await inbox(teacherToken);
    expect(teacherInbox.body.data).toMatchObject({ total: 2, unreadCount: 2 });
    expect(teacherInbox.body.data.items.map((item: { title: string }) => item.title)).toEqual([
      'Lịch họp giảng viên',
      'Thông báo chung'
    ]);
  });
});
