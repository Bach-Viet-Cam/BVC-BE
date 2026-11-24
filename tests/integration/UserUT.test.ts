import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Users (admin)', () => {
  let adminToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('ITC015 - Admin liệt kê và lọc người dùng', async () => {
    const matched = await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      status: 'ACTIVE',
      username: 'student ACTIVE cần tìm',
      email: 'student.active@fpt.edu.vn',
      studentCode: 'SE100'
    });
    await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      status: 'LOCKED',
      username: 'student LOCKED cần tìm',
      email: 'student.locked@fpt.edu.vn',
      studentCode: 'SE101'
    });
    await TestDatabase.createUser({
      role: TestDatabase.roles.TEACHER,
      status: 'ACTIVE',
      username: 'student TEACHER cần tìm',
      email: 'student.teacher@fpt.edu.vn'
    });
    await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      status: 'ACTIVE',
      username: 'Người dùng khác',
      email: 'khac@fpt.edu.vn'
    });

    const response = await request(app)
      .get('/api/v1/users?role=1&status=ACTIVE&q=student&page=1&pageSize=10')
      .set('Authorization', adminToken);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(response.body.data.items).toEqual([
      expect.objectContaining({ id: matched.id, email: 'student.active@fpt.edu.vn', role: 1, status: 'ACTIVE' })
    ]);

    const forbidden = await request(app)
      .get('/api/v1/users?role=1&status=ACTIVE&q=student')
      .set('Authorization', TestDatabase.tokenFor(matched));
    expect(forbidden.status).toBe(403);
  });

  it('ITC016 - Tạo user và chặn email trùng', async () => {
    const body = { email: 'duplicate.user@fpt.edu.vn', username: 'Người dùng trùng', role: 1, studentCode: 'SE200' };

    const created = await request(app).post('/api/v1/users').set('Authorization', adminToken).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      message: 'Tạo người dùng thành công.',
      data: { email: body.email, username: body.username, role: 1, status: 'PENDING', studentCode: 'SE200' }
    });

    const duplicated = await request(app).post('/api/v1/users').set('Authorization', adminToken).send(body);
    expect(duplicated.status).toBe(409);
    expect(duplicated.body.message).toBe('Email đã tồn tại.');

    const count = await TestDatabase.prisma.user.count({ where: { email: body.email } });
    expect(count).toBe(1);
  });

  it('ITC017 - Import sinh viên dry-run rồi update', async () => {
    const seeded = await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      email: 'import.student@fpt.edu.vn',
      username: 'Tên cũ',
      studentCode: 'SE300'
    });
    // Endpoint nhận JSON rows đã parse từ CSV (FE dùng csv-parse); validation buộc rowNumber/studentCode/username/email.
    const rowsFor = (username: string) => [
      { rowNumber: 1, studentCode: 'SE300', username, email: 'import.student@fpt.edu.vn' }
    ];

    const dryRun = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({ rows: rowsFor('Tên mới'), mode: 'update', dryRun: true });
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.data).toMatchObject({ dryRun: true, createdCount: 0, updatedCount: 0 });
    expect((await TestDatabase.prisma.user.findUniqueOrThrow({ where: { id: seeded.id } })).username).toBe('Tên cũ');

    const update = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({ rows: rowsFor('Tên mới'), mode: 'update', dryRun: false });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ message: 'Import hoàn tất.', data: { dryRun: false, updatedCount: 1, createdCount: 0 } });
    expect((await TestDatabase.prisma.user.findUniqueOrThrow({ where: { id: seeded.id } })).username).toBe('Tên mới');
  });

  it('ITC018 - Khóa mở khóa và chặn tự đổi role', async () => {
    const target = await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      status: 'ACTIVE',
      email: 'target.user@fpt.edu.vn'
    });
    const admin = await TestDatabase.prisma.user.findFirstOrThrow({ where: { role: TestDatabase.roles.SYSTEM_ADMIN } });

    const changeOwnRole = await request(app)
      .patch(`/api/v1/users/${admin.id}`)
      .set('Authorization', adminToken)
      .send({ role: 1 });
    expect(changeOwnRole.status).toBe(403);
    expect(changeOwnRole.body.message).toBe('Bạn không thể thay đổi vai trò của chính mình.');

    const locked = await request(app).post(`/api/v1/users/${target.id}/lock`).set('Authorization', adminToken);
    expect(locked.status).toBe(200);
    expect(locked.body).toMatchObject({ message: 'Đã khóa tài khoản.', data: { status: 'LOCKED' } });

    const unlocked = await request(app).post(`/api/v1/users/${target.id}/unlock`).set('Authorization', adminToken);
    expect(unlocked.status).toBe(200);
    expect(unlocked.body).toMatchObject({ message: 'Đã mở khóa tài khoản.', data: { status: 'PENDING' } });
  });
});
