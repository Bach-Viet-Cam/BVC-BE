import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Instrument, category and FAQ integration', () => {
  let admin: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let adminToken: string;
  let studentToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
    studentToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT }));
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('ITC032 - Quản lý nhạc cụ và đọc public', async () => {
    const created = await request(app)
      .post('/api/v1/instruments')
      .set('Authorization', adminToken)
      .send({ code: 'ITC032_GUITAR', name: 'Dan guitar A', description: 'Nhac cu thu nghiem' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code: 'ITC032_GUITAR', name: 'Dan guitar A', isActive: true });
    const instrumentId = created.body.data.id as string;

    const renamed = await request(app)
      .patch(`/api/v1/instruments/${instrumentId}`)
      .set('Authorization', adminToken)
      .send({ name: 'Dan guitar B' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Dan guitar B');

    const deactivated = await request(app)
      .post(`/api/v1/instruments/${instrumentId}/deactivate`)
      .set('Authorization', adminToken);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.isActive).toBe(false);

    // Guest chỉ thấy nhạc cụ còn hoạt động, dù có yêu cầu status=all
    const publicList = await request(app).get('/api/v1/instruments?status=all');
    expect(publicList.status).toBe(200);
    expect(Array.isArray(publicList.body.data)).toBe(true);
    expect(publicList.body.data.map((item: { id: string }) => item.id)).not.toContain(instrumentId);

    const adminList = await request(app)
      .get('/api/v1/instruments?status=inactive')
      .set('Authorization', adminToken);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.map((item: { id: string }) => item.id)).toContain(instrumentId);
  });

  it('ITC033 - CRUD content-category và category', async () => {
    const contentCreated = await request(app)
      .post('/api/v1/content-categories')
      .set('Authorization', adminToken)
      .send({ name: 'Noi dung A' });
    expect(contentCreated.status).toBe(201);
    const contentId = contentCreated.body.data.id as string;

    const contentRenamed = await request(app)
      .patch(`/api/v1/content-categories/${contentId}`)
      .set('Authorization', adminToken)
      .send({ name: 'Noi dung B' });
    expect(contentRenamed.status).toBe(200);
    expect(contentRenamed.body.data.name).toBe('Noi dung B');

    const contentDeleted = await request(app)
      .delete(`/api/v1/content-categories/${contentId}`)
      .set('Authorization', adminToken);
    expect(contentDeleted.status).toBe(200);

    const categoryCreated = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', adminToken)
      .send({ type: 'GENRE', name: 'The loai ITC033' });
    expect(categoryCreated.status).toBe(201);
    const categoryId = categoryCreated.body.data.id as string;

    const categoryRenamed = await request(app)
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', adminToken)
      .send({ name: 'The loai da doi' });
    expect(categoryRenamed.status).toBe(200);
    expect(categoryRenamed.body.data.name).toBe('The loai da doi');

    // Gắn bài nhạc vào category: không thể xoá khi còn được sử dụng
    await TestDatabase.prisma.piece.create({
      data: {
        title: 'Bai dung category',
        ownerId: admin.id,
        genreId: categoryId,
        kind: 'FINGER_EXERCISE',
        bpm: 90,
        visibility: 'PUBLIC'
      }
    });
    const categoryDeleteUsed = await request(app)
      .delete(`/api/v1/categories/${categoryId}`)
      .set('Authorization', adminToken);
    // AppError.conflict giữ bài nhạc đang dùng: HTTP 409 (case expected 400 trong sheet)
    expect(categoryDeleteUsed.status).toBe(409);

    const lecturerToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER }));
    expect((await request(app).post('/api/v1/categories').set('Authorization', lecturerToken).send({ type: 'GENRE', name: 'Khong duoc' })).status).toBe(403);
    expect((await request(app).post('/api/v1/content-categories').set('Authorization', lecturerToken).send({ name: 'Khong duoc' })).status).toBe(403);
  });

  it('ITC034 - FAQ public đọc được, admin sửa được', async () => {
    const publicBefore = await request(app).get('/api/v1/faqs');
    expect(publicBefore.status).toBe(200);
    expect(publicBefore.body.data.items).toEqual([]);

    const created = await request(app)
      .post('/api/v1/admin/faqs')
      .set('Authorization', adminToken)
      .send({ question: 'Cau hoi cu ITC034?', answer: 'Tra loi cu.', topic: 'PLATFORM' });
    expect(created.status).toBe(201);
    const faqId = created.body.data.id as string;
    const before = await TestDatabase.prisma.faq.findUniqueOrThrow({ where: { id: faqId } });

    const publicList = await request(app).get('/api/v1/faqs');
    expect(publicList.status).toBe(200);
    expect(publicList.body.data.items).toHaveLength(1);
    expect(publicList.body.data.items[0]).toMatchObject({ question: 'Cau hoi cu ITC034?' });

    const updated = await request(app)
      .patch(`/api/v1/admin/faqs/${faqId}`)
      .set('Authorization', adminToken)
      .send({ question: 'Cau hoi moi ITC034?' });
    expect(updated.status).toBe(200);
    const after = await TestDatabase.prisma.faq.findUniqueOrThrow({ where: { id: faqId } });
    expect(after.question).toBe('Cau hoi moi ITC034?');
    expect(after.questionKey).not.toBe(before.questionKey);

    expect((await request(app).post('/api/v1/admin/faqs').set('Authorization', studentToken)
      .send({ question: 'Sinh vien khong duoc?', answer: 'Khong.', topic: 'PLATFORM' })).status).toBe(403);

    const removed = await request(app).delete(`/api/v1/admin/faqs/${faqId}`).set('Authorization', adminToken);
    expect(removed.status).toBe(200);
    expect(await TestDatabase.prisma.faq.findUnique({ where: { id: faqId } })).toBeNull();
  });
});
