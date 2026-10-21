import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InMemoryJobQueue from '../src/lib/queue/InMemoryJobQueue.ts';
import TestContext from './support/TestContext.ts';

const { app, api } = TestContext;
const CALLBACK_SECRET = 'test-callback-secret';

describe('Tích hợp AI (JOB-01 → JOB-02)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;
  let pieceId: string;

  beforeEach(async () => {
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'gv@test.local');
    pieceId = (await TestContext.createPiece(lecturer)).id;
  });

  async function createMainWithAudio(): Promise<string> {
    const response = await TestContext.createSheet(lecturer, pieceId, { name: 'Chính', referenceAudioId: await TestContext.uploadWav(lecturer) });
    return response.body.data.id;
  }

  it('lưu bản thu cho bản chính → PROCESSING và đẩy job; bản theo độ khó không đẩy job', async () => {
    const mainId = await createMainWithAudio();
    const mainSheet = await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainId } });
    expect(mainSheet.analysisStatus).toBe('PROCESSING');
    expect(TestContext.queue.enqueued).toEqual([{ jobId: mainSheet.analysisJobId, sheetMusicId: mainId }]);

    await TestContext.createSheet(lecturer, pieceId, { name: 'Dễ', referenceAudioId: await TestContext.uploadWav(lecturer) });
    expect(TestContext.queue.enqueued).toHaveLength(1);
  });

  it('thay bản thu khi job đang chạy → job cũ bị hủy, job mới chạy; callback của job cũ bị bỏ qua', async () => {
    const mainId = await createMainWithAudio();
    const oldJobId = (await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainId } })).analysisJobId!;

    await request(app).put(`${api}/lecturer/sheet-music/${mainId}/files/audio`)
      .set(TestContext.auth(lecturer)).send({ fileId: await TestContext.uploadWav(lecturer, 4) }).expect(200);
    const newJobId = (await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainId } })).analysisJobId!;
    expect(newJobId).not.toBe(oldJobId);
    expect(TestContext.queue.cancelled).toContain(oldJobId);
    expect(TestContext.queue.enqueued.at(-1)).toEqual({ jobId: newJobId, sheetMusicId: mainId });

    const staleCallback = await request(app).post(`${api}/internal/sheet-music/${mainId}/analysis`)
      .set('X-Callback-Secret', CALLBACK_SECRET).send({ jobId: oldJobId, status: 'READY', analysisFileUrl: 'old.json' });
    expect(staleCallback.body.data.isApplied).toBe(false);
    expect((await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainId } })).analysisStatus).toBe('PROCESSING');

    const freshCallback = await request(app).post(`${api}/internal/sheet-music/${mainId}/analysis`)
      .set('X-Callback-Secret', CALLBACK_SECRET).send({ jobId: newJobId, status: 'READY', analysisFileUrl: 'new.json', timeSignatureMissing: true });
    expect(freshCallback.body.data.isApplied).toBe(true);
    const updated = await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainId } });
    expect(updated).toMatchObject({ analysisStatus: 'READY', analysisFileUrl: 'new.json', timeSignatureMissing: true });
  });

  it('đã có file phân tích cũ: thay bản thu giữ nguyên trạng thái "Sẵn sàng" đến khi có file mới', async () => {
    const mainId = await createMainWithAudio();
    await TestContext.prisma.sheetMusic.update({ where: { id: mainId }, data: { analysisStatus: 'READY', analysisFileUrl: 'v1.json' } });
    await request(app).put(`${api}/lecturer/sheet-music/${mainId}/files/audio`)
      .set(TestContext.auth(lecturer)).send({ fileId: await TestContext.uploadWav(lecturer, 4) }).expect(200);
    const sheetMusic = await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainId } });
    expect(sheetMusic).toMatchObject({ analysisStatus: 'READY', analysisFileUrl: 'v1.json' });
  });

  it('callback lỗi → trạng thái "Lỗi" kèm lý do; sai secret → 401', async () => {
    const mainId = await createMainWithAudio();
    const unauthorized = await request(app).post(`${api}/internal/sheet-music/${mainId}/analysis`)
      .set('X-Callback-Secret', 'wrong').send({ status: 'ERROR', reason: 'x' });
    expect(unauthorized.status).toBe(401);

    await request(app).post(`${api}/internal/sheet-music/${mainId}/analysis`)
      .set('X-Callback-Secret', CALLBACK_SECRET).send({ status: 'ERROR', reason: 'Không nhận diện được cao độ' }).expect(200);
    const list = await request(app).get(`${api}/lecturer/pieces/${pieceId}/sheet-music`).set(TestContext.auth(lecturer));
    expect(list.body.data.groups[0].items[0].analysis).toMatchObject({ status: 'ERROR', error: 'Không nhận diện được cao độ' });
  });

  it('hàng đợi in-memory: thử lại tối đa 3 lần rồi gọi onFailed', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('AI down'));
    const onFailed = vi.fn().mockResolvedValue(undefined);
    const queue = new InMemoryJobQueue({ name: 'test', attempts: 3, backoffMs: 1, handler, onFailed });
    await queue.enqueue('job-1', { jobId: 'job-1', sheetMusicId: 's' });
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1));
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('hàng đợi in-memory: job bị hủy trước khi chạy thì không chạy', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const queue = new InMemoryJobQueue({ name: 'test', attempts: 3, backoffMs: 1, handler, onFailed: vi.fn() });
    await queue.enqueue('job-2', { jobId: 'job-2', sheetMusicId: 's' });
    await queue.cancel('job-2');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handler).not.toHaveBeenCalled();
  });
});
