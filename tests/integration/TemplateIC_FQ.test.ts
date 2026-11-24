import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Template cases: Instrument/Category & FAQ', () => {
  let adminToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  async function createInstrument(overrides: Partial<{ code: string; name: string; description: string }> = {}) {
    const created = await request(app)
      .post('/api/v1/instruments')
      .set('Authorization', adminToken)
      .send({
        code: overrides.code ?? `ITC_${TestDatabase.nextId()}_${Date.now()}`,
        name: overrides.name ?? `Đàn test ${TestDatabase.nextId()}`,
        ...(overrides.description !== undefined ? { description: overrides.description } : {})
      });
    expect(created.status).toBe(201);
    return created.body.data as { id: string; code: string; name: string };
  }

  async function createFaq(input: { question: string; answer: string; topic: string }) {
    const created = await request(app)
      .post('/api/v1/admin/faqs')
      .set('Authorization', adminToken)
      .send(input);
    expect(created.status).toBe(201);
    return created.body.data as { id: string };
  }

  it('ITC-IC-008 - Admin sửa được name/description nhưng không đổi được code', async () => {
    const instrument = await createInstrument({ description: 'Mô tả cũ' });

    const renamed = await request(app)
      .patch(`/api/v1/instruments/${instrument.id}`)
      .set('Authorization', adminToken)
      .send({ name: 'Đàn đã đổi tên', description: 'Mô tả mới' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({
      name: 'Đàn đã đổi tên',
      description: 'Mô tả mới',
      code: instrument.code
    });

    const afterRename = await TestDatabase.prisma.instrument.findUniqueOrThrow({ where: { id: instrument.id } });
    expect(afterRename.name).toBe('Đàn đã đổi tên');
    expect(afterRename.description).toBe('Mô tả mới');
    expect(afterRename.code).toBe(instrument.code);

    // updateSchema là strict và chỉ chứa name/description -> gửi code bị từ chối
    const codeAttempt = await request(app)
      .patch(`/api/v1/instruments/${instrument.id}`)
      .set('Authorization', adminToken)
      .send({ code: 'CODE_MOI' });
    expect(codeAttempt.status).toBe(400);
    expect(codeAttempt.body.success).toBe(false);
    expect(JSON.stringify(codeAttempt.body)).toContain('code');

    const afterCodeAttempt = await TestDatabase.prisma.instrument.findUniqueOrThrow({ where: { id: instrument.id } });
    expect(afterCodeAttempt.code).toBe(instrument.code);
    expect(afterCodeAttempt.name).toBe('Đàn đã đổi tên');
  });
  it('ITC-IC-014 - Validate POST /instruments: code/name rỗng, code có dấu cách, code > 30 ký tự', async () => {
    const base = { code: 'CODE_HOP_LE', name: 'Ten hop le' };
    const cases = [
      { body: { ...base, code: '' }, field: 'code' },
      { body: { ...base, name: '' }, field: 'name' },
      { body: { ...base, code: 'AB CD' }, field: 'code' },
      { body: { ...base, code: 'A'.repeat(31) }, field: 'code' }
    ];

    for (const { body, field } of cases) {
      const res = await request(app)
        .post('/api/v1/instruments')
        .set('Authorization', adminToken)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.field).toBe(field);
      expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    }
  });
  it('ITC-IC-015 - Validate PUT /instruments/:id/tunes và xoá hết tune với mảng rỗng', async () => {
    const instrument = await createInstrument();
    const putTunes = (tunes: unknown[]) =>
      request(app)
        .put(`/api/v1/instruments/${instrument.id}/tunes`)
        .set('Authorization', adminToken)
        .send({ tunes });

    const blankName = await putTunes([{ tuneName: '   ', pitch: 440 }]);
    expect(blankName.status).toBe(400);
    expect(blankName.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'tunes.0.tuneName', message: 'Tên dây hoặc nốt không được để trống' })
    ]));

    const zeroPitch = await putTunes([{ tuneName: 'Day 1', pitch: 0 }]);
    expect(zeroPitch.status).toBe(400);
    expect(zeroPitch.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'tunes.0.pitch', message: 'Cao độ chuẩn phải lớn hơn 0' })
    ]));

    const initial = await putTunes([{ tuneName: 'Day 1', pitch: 440 }]);
    expect(initial.status).toBe(200);
    expect(initial.body.data).toHaveLength(1);
    expect(await TestDatabase.prisma.instrumentTune.count({ where: { instrumentId: instrument.id } })).toBe(1);

    const cleared = await putTunes([]);
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toEqual([]);
    expect(await TestDatabase.prisma.instrumentTune.count({ where: { instrumentId: instrument.id } })).toBe(0);
  });
  it('ITC-IC-016 - id nhạc cụ không tồn tại trả 404 cho PATCH / activate / deactivate / tunes', async () => {
    const missingId = '00000000-0000-4000-8000-000000000000';
    const expectNotFound = (res: { status: number; body: { message: string } }): void => {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Không tìm thấy nhạc cụ.');
    };

    expectNotFound(await request(app)
      .patch(`/api/v1/instruments/${missingId}`)
      .set('Authorization', adminToken)
      .send({ name: 'Doi ten' }));

    expectNotFound(await request(app)
      .post(`/api/v1/instruments/${missingId}/activate`)
      .set('Authorization', adminToken));

    expectNotFound(await request(app)
      .post(`/api/v1/instruments/${missingId}/deactivate`)
      .set('Authorization', adminToken));

    expectNotFound(await request(app).get(`/api/v1/instruments/${missingId}/tunes`));

    expectNotFound(await request(app)
      .put(`/api/v1/instruments/${missingId}/tunes`)
      .set('Authorization', adminToken)
      .send({ tunes: [{ tuneName: 'Day 1', pitch: 440 }] }));
  });
  it('ITC-FQ-002 - Validate POST /admin/faqs: question/answer rỗng và topic sai', async () => {
    const base = { question: 'Cau hoi hop le?', answer: 'Tra loi hop le.', topic: 'PLATFORM' };
    const post = (body: object) =>
      request(app).post('/api/v1/admin/faqs').set('Authorization', adminToken).send(body);

    const blankQuestion = await post({ ...base, question: '' });
    expect(blankQuestion.status).toBe(400);
    expect(blankQuestion.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'question', message: 'Vui lòng nhập câu hỏi.' })
    ]));

    const blankAnswer = await post({ ...base, answer: '' });
    expect(blankAnswer.status).toBe(400);
    expect(blankAnswer.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'answer', message: 'Vui lòng nhập câu trả lời.' })
    ]));

    const badTopic = await post({ ...base, topic: 'NOT_A_TOPIC' });
    expect(badTopic.status).toBe(400);
    expect(badTopic.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'topic' })
    ]));
  });
  it('ITC-FQ-004 - Lọc FAQ public theo topic, q và phân trang', async () => {
    const platform = await createFaq({ question: 'Cach dang nhap?', answer: 'Dung email de dang nhap.', topic: 'PLATFORM' });
    const assignments = await createFaq({ question: 'Nop bai tap o dau?', answer: 'Trang bai tap.', topic: 'ASSIGNMENTS' });

    const byTopic = await request(app).get('/api/v1/faqs?topic=PLATFORM');
    expect(byTopic.status).toBe(200);
    expect(byTopic.body.data.items).toHaveLength(1);
    expect(byTopic.body.data.items[0]).toMatchObject({ id: platform.id, topic: 'PLATFORM' });

    const byKeyword = await request(app).get('/api/v1/faqs').query({ q: 'dang nhap' });
    expect(byKeyword.status).toBe(200);
    expect(byKeyword.body.data.items.map((faq: { id: string }) => faq.id)).toEqual([platform.id]);

    const page1 = await request(app).get('/api/v1/faqs?page=1&pageSize=1');
    expect(page1.status).toBe(200);
    expect(page1.body.data).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(page1.body.data.items).toHaveLength(1);

    const page2 = await request(app).get('/api/v1/faqs?page=2&pageSize=1');
    expect(page2.status).toBe(200);
    expect(page2.body.data).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(page2.body.data.items).toHaveLength(1);
    expect([page1.body.data.items[0].id, page2.body.data.items[0].id].sort()).toEqual([platform.id, assignments.id].sort());
  });
  it('ITC-FQ-005 - DELETE FAQ: thành công, id sai định dạng 400, xoá lại 404', async () => {
    const faq = await createFaq({ question: 'Cau hoi can xoa?', answer: 'Tra loi.', topic: 'PLATFORM' });

    const badId = await request(app)
      .delete('/api/v1/admin/faqs/not-a-uuid')
      .set('Authorization', adminToken);
    expect(badId.status).toBe(400);
    expect(badId.body.field).toBe('id');
    expect(badId.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'id' })]));

    const removed = await request(app)
      .delete(`/api/v1/admin/faqs/${faq.id}`)
      .set('Authorization', adminToken);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Đã xóa câu hỏi.');
    expect(await TestDatabase.prisma.faq.findUnique({ where: { id: faq.id } })).toBeNull();

    const again = await request(app)
      .delete(`/api/v1/admin/faqs/${faq.id}`)
      .set('Authorization', adminToken);
    expect(again.status).toBe(404);
    expect(again.body.message).toBe('Câu hỏi không tồn tại.');
  });
});
