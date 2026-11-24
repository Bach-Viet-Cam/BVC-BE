import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

// ITC006-ITC007: tổng quan và giám sát admin, kèm guard quyền.
describe('AdminStats integration', () => {
  let adminToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  // Tạo assignment để có thể seed submission qua harness.
  async function seedAssignment() {
    const lecturer = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    const instrument = await TestDatabase.createInstrument();
    const classRecord = await TestDatabase.createClass(lecturer.id, instrument.id);
    return TestDatabase.createAssignment(classRecord.id, lecturer.id);
  }

  it('ITC006 - Tổng quan admin khớp dữ liệu seed', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60 * 60 * 1000);
    const old = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const activeA = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    const activeB = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    await TestDatabase.prisma.user.update({ where: { id: activeA.id }, data: { lastLoginAt: recent } });
    await TestDatabase.prisma.user.update({ where: { id: activeB.id }, data: { lastLoginAt: recent } });
    // Thêm người dùng không active để kiểm tra giới hạn recentUsers.
    for (let index = 0; index < 4; index += 1) {
      await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    }

    const assignment = await seedAssignment();
    await TestDatabase.createSubmission(assignment.id, activeA.id, { status: 'COMPLETED', submittedAt: recent });
    await TestDatabase.createSubmission(assignment.id, activeB.id, { status: 'COMPLETED', submittedAt: recent });
    await TestDatabase.createSubmission(assignment.id, activeA.id, { status: 'FAILED', submittedAt: recent });
    await TestDatabase.createSubmission(assignment.id, activeA.id, { status: 'COMPLETED', submittedAt: old });

    const response = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', adminToken);

    expect(response.status).toBe(200);
    expect(response.body.data.activeUsers7d).toBe(2);
    expect(response.body.data.submissions7d).toBe(3);
    expect(response.body.data.failed24h).toBe(1);
    expect(response.body.data.submissionsByDay).toHaveLength(14);
    expect(response.body.data.recentUsers.length).toBeLessThanOrEqual(5);
  });

  it('ITC007 - Giám sát admin và guard quyền', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);
    const assignment = await seedAssignment();
    const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });

    await TestDatabase.createSubmission(assignment.id, student.id, { status: 'COMPLETED', submittedAt: recent });
    await TestDatabase.createSubmission(assignment.id, student.id, { status: 'COMPLETED', submittedAt: recent });
    await TestDatabase.createSubmission(assignment.id, student.id, { status: 'COMPLETED', submittedAt: recent });
    await TestDatabase.createSubmission(assignment.id, student.id, { status: 'FAILED', submittedAt: recent });

    const adminResponse = await request(app)
      .get('/api/v1/admin/monitoring')
      .set('Authorization', adminToken);
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.errorRate7d).toBe(25);
    expect(adminResponse.body.data.errorRate7d).toBeGreaterThanOrEqual(0);
    expect(adminResponse.body.data.errorRate7d).toBeLessThanOrEqual(100);
    expect(Array.isArray(adminResponse.body.data.queue)).toBe(true);

    const studentToken = TestDatabase.tokenFor(student);
    const studentResponse = await request(app)
      .get('/api/v1/admin/monitoring')
      .set('Authorization', studentToken);
    expect(studentResponse.status).toBe(403);
  });
});
