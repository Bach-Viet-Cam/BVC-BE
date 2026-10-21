import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from './support/TestContext.ts';

const { app, api } = TestContext;

// Gửi job phân tích bản thu mẫu đang tạm tắt (TODO chuyển sang Rhythm service + RabbitMQ)
describe('Phân tích bản thu mẫu (tạm tắt)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;
  let pieceId: string;

  beforeEach(async () => {
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'gv@test.local');
    pieceId = (await TestContext.createPiece(lecturer)).id;
  });

  it('lưu bản thu cho bản chính không còn đẩy job: trạng thái giữ NONE', async () => {
    const response = await TestContext.createSheet(lecturer, pieceId, { name: 'Chính', referenceAudioId: await TestContext.uploadWav(lecturer) });
    expect(response.status).toBe(201);
    const sheetMusic = await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(sheetMusic).toMatchObject({ analysisStatus: 'NONE', analysisJobId: null });
  });

  it('đã có file phân tích cũ: thay bản thu vẫn giữ nguyên trạng thái "Sẵn sàng"', async () => {
    const created = await TestContext.createSheet(lecturer, pieceId, { name: 'Chính', referenceAudioId: await TestContext.uploadWav(lecturer) });
    const mainId = created.body.data.id;
    await TestContext.prisma.sheetMusic.update({ where: { id: mainId }, data: { analysisStatus: 'READY', analysisFileUrl: 'v1.json' } });
    await request(app).put(`${api}/lecturer/sheet-music/${mainId}/files/audio`)
      .set(TestContext.auth(lecturer)).send({ fileId: await TestContext.uploadWav(lecturer, 4) }).expect(200);
    const sheetMusic = await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainId } });
    expect(sheetMusic).toMatchObject({ analysisStatus: 'READY', analysisFileUrl: 'v1.json' });
  });

  it('route callback AI đang tắt → 404', async () => {
    const created = await TestContext.createSheet(lecturer, pieceId, { name: 'Chính', referenceAudioId: await TestContext.uploadWav(lecturer) });
    const callback = await request(app).post(`${api}/internal/sheet-music/${created.body.data.id}/analysis`).send({ status: 'READY', analysisFileUrl: 'x.json' });
    expect(callback.status).toBe(404);
  });
});
