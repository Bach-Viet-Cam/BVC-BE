import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

function assertNoSecret(body: unknown): void {
  const text = JSON.stringify(body ?? '');
  expect(text).not.toContain('DATABASE_URL');
  expect(text).not.toContain('postgresql://');
}

describe('Security', () => {
  let student: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let studentToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    studentToken = TestDatabase.tokenFor(student);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('TC-SEC-001 - Chưa đăng nhập không đọc được cấu hình', async () => {
    const response = await request(app).get('/api/v1/system-configs');
    expect(response.status).toBe(401);
    assertNoSecret(response.body);
  });

  it('TC-SEC-002 - Student không xem được tổng quan admin', async () => {
    const response = await request(app).get('/api/v1/admin/overview').set('Authorization', studentToken);
    expect(response.status).toBe(403);
    assertNoSecret(response.body);
  });

  it('TC-SEC-003 - Student không sửa được tham số hệ thống', async () => {
    const config = await TestDatabase.prisma.systemConfig.findFirstOrThrow({ where: { key: { contains: 'min_accuracy' } } });
    const response = await request(app)
      .patch(`/api/v1/system-configs/${config.id}`)
      .set('Authorization', studentToken)
      .send({ value: '65' });
    expect(response.status).toBe(403);
    const unchanged = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { id: config.id } });
    expect(unchanged.value).toBe(config.value);
    assertNoSecret(response.body);
  });

  it('TC-SEC-004 - Student không tạo được thông báo admin', async () => {
    const response = await request(app)
      .post('/api/v1/admin/notifications')
      .set('Authorization', studentToken)
      .send({ title: 'Truy cap trai phep', body: 'Noi dung', type: 'SYSTEM', target: 'ALL', action: 'send' });
    expect(response.status).toBe(403);
    expect(await TestDatabase.prisma.notification.count()).toBe(0);
    assertNoSecret(response.body);
  });

  it('TC-SEC-005 - Student không liệt kê được users', async () => {
    const response = await request(app).get('/api/v1/users').set('Authorization', studentToken);
    expect(response.status).toBe(403);
    assertNoSecret(response.body);
  });

  it('TC-SEC-006 - Giảng viên khác không ghi đè nội dung upload', async () => {
    const owner = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    const other = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    const ownerToken = TestDatabase.tokenFor(owner);

    const presign = await request(app).post('/api/v1/uploads/presign').set('Authorization', ownerToken)
      .send({ kind: 'SHEET', fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 });
    expect(presign.status).toBe(201);
    const fileId = presign.body.data.fileId as string;

    const overwrite = await request(app)
      .put(`/api/v1/uploads/${fileId}/content`)
      .set('Authorization', TestDatabase.tokenFor(other))
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('x'));
    expect(overwrite.status).toBe(400);
    expect(overwrite.body.code).toBe('MSG-08');
    assertNoSecret(overwrite.body);

    const file = await TestDatabase.prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(file).toMatchObject({ uploadedById: owner.id, status: 'PENDING' });
  });

  it('TC-SEC-007 - Traversal không đọc được .env', async () => {
    const paths = [
      '/uploads/../.env',
      '/uploads/..%2f.env',
      '/uploads/%2e%2e%2f.env',
      '/uploads/audio/../../.env',
      '/uploads/audio/..%2f..%2f.env'
    ];
    for (const target of paths) {
      const response = await request(app).get(target);
      expect([403, 404], target).toContain(response.status);
      assertNoSecret(response.body);
      expect(response.text, target).not.toContain('DATABASE_URL');
    }
  });

  it('TC-SEC-008 - Token của tài khoản bị khóa bị từ chối', async () => {
    const locked = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT, status: 'LOCKED' });
    const response = await request(app)
      .get('/api/v1/me/notifications')
      .set('Authorization', TestDatabase.tokenFor(locked));
    expect(response.status).toBe(403);
    expect(response.body.message).toContain(' bị khóa');
    assertNoSecret(response.body);

    // Token của user bình thường vẫn dùng được trên cùng endpoint
    expect((await request(app).get('/api/v1/me/notifications').set('Authorization', studentToken)).status).toBe(200);
  });
});
