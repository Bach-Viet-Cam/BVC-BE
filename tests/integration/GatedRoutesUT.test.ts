import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Gated routes', () => {
  let adminToken: string;
  let studentToken: string;
  let strangerToken: string;
  let submissionId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    adminToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN }));
    const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    strangerToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT }));
    studentToken = TestDatabase.tokenFor(student);

    const lecturer = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    const instrument = await TestDatabase.createInstrument();
    const classRecord = await TestDatabase.createClass(lecturer.id, instrument.id);
    const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
    const submission = await TestDatabase.createSubmission(assignment.id, student.id, { status: 'COMPLETED' });
    submissionId = submission.id;
    await TestDatabase.prisma.submission.update({
      where: { id: submissionId },
      data: { aiFeedback: 'Giữ đều nhịp câu cuối.', evaluationId: randomUUID(), analyzedAt: new Date() }
    });
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('ITC035 - AI rating đọc ghi và danh sách admin', async () => {
    const path = `/api/v1/submissions/${submissionId}/ai-rating`;

    expect((await request(app).get(path)).status).toBe(401);

    const initial = await request(app).get(path).set('Authorization', studentToken);
    expect(initial.status).toBe(200);
    const feedbackKey = initial.body.data.feedbackKey as string;
    expect(feedbackKey).toMatch(/^[a-f0-9]{64}$/);
    expect(initial.body.data.feedback).toBe('Giữ đều nhịp câu cuối.');

    const first = await request(app).put(path).set('Authorization', studentToken)
      .send({ feedbackKey, accuracyStars: 4, satisfactionStars: 5 });
    expect(first.status).toBe(200);
    expect(first.body.data.rating).toMatchObject({ accuracyStars: 4, satisfactionStars: 5 });

    // Ghi lại cùng feedbackKey: cập nhật bản cũ thay vì tạo bản mới
    const second = await request(app).put(path).set('Authorization', studentToken)
      .send({ feedbackKey, accuracyStars: 3, satisfactionStars: 5 });
    expect(second.status).toBe(200);
    expect(second.body.data.rating.accuracyStars).toBe(3);
    expect(await TestDatabase.prisma.aiFeedbackRating.count({ where: { submissionId } })).toBe(1);

    const history = await request(app).get('/api/v1/admin/ai-ratings').set('Authorization', adminToken);
    expect(history.status).toBe(200);
    expect(history.body.data.items).toHaveLength(1);

    // Người không liên quan bị che giấu resource; role không đường dẫn bị chặn bởi guard
    expect((await request(app).get(path).set('Authorization', strangerToken)).status).toBe(404);
    expect((await request(app).get(path).set('Authorization', adminToken)).status).toBe(403);
  });

  it('ITC036 - Raw URL không traversal được tới file nhạy cảm', async () => {
    const paths = [
      '/uploads/../.env',
      '/uploads/..%2f.env',
      '/uploads/%2e%2e/.env',
      '/uploads/%2e%2e%2f.env',
      '/uploads/./../.env',
      '/uploads/....//.env',
      '/uploads/audio/../../.env',
      '/uploads/audio/..%2f..%2f.env',
      '/uploads/%2e%2e/%2e%2e/.env'
    ];

    for (const target of paths) {
      const response = await request(app).get(target);
      expect([403, 404], target).toContain(response.status);
      expect(response.text, target).not.toContain('DATABASE_URL');
      expect(response.text, target).not.toContain('postgresql://');
    }
  });
});
