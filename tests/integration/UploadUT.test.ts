import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import SampleMediaFactory from '../../prisma/seed/SampleMediaFactory.ts';
import TestContext from '../support/TestContext.ts';

const { app, api, prisma } = TestContext;
const storageRoot = path.resolve('storage-test');

describe('UploadIntegration (UTC)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;

  beforeEach(async () => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'upload-ut@test.local');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ITC019 - Presign AUDIO sai định dạng thì trả MSG-13 và không tạo bản ghi', async () => {
    const response = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'AUDIO', fileName: 'ghi-am.docx', mimeType: 'application/msword', size: 1000 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('MSG-13');
    expect(response.body.message).toContain('Định dạng file không được hỗ trợ.');
    expect(response.body.message).toContain('MP3, WAV, M4A');
    expect(await prisma.mediaFile.count()).toBe(0);
  });

  it('ITC020 - Giới hạn AUDIO đọc từ config upload.audio.max_mb', async () => {
    const overSize = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'AUDIO', fileName: 'ban-thu.wav', mimeType: 'audio/wav', size: 21 * 1024 * 1024 });

    expect(overSize.status).toBe(400);
    expect(overSize.body).toMatchObject({ code: 'MSG-14', message: 'File vượt quá dung lượng tối đa 20 MB.' });

    await prisma.systemConfig.create({ data: {
      key: 'upload.sheet.max_mb', value: '1', label: 'Sheet max MB', valueType: 'NUMBER', group: 'FILE_LIMIT'
    } });
    const tightened = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'SHEET', fileName: 'ban-nhac.pdf', mimeType: 'application/pdf', size: 2 * 1024 * 1024 });

    expect(tightened.status).toBe(400);
    expect(tightened.body).toMatchObject({ code: 'MSG-14', message: 'File vượt quá dung lượng tối đa 1 MB.' });
    expect(await prisma.mediaFile.count()).toBe(0);
  });

  it('ITC021 - Confirm PDF giả thì xóa cả bản ghi lẫn object trên đĩa', async () => {
    const fileId = await TestContext.upload(lecturer, 'SHEET', 'gia-mao.pdf', 'application/pdf', Buffer.from('day la van ban thuong, khong phai pdf'));
    const mediaFile = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
    const objectPath = path.join(storageRoot, mediaFile.storageKey);
    expect(fs.existsSync(objectPath)).toBe(true);

    const confirm = await request(app).post(`${api}/uploads/${fileId}/confirm`).set(TestContext.auth(lecturer));

    expect(confirm.status).toBe(400);
    expect(confirm.body.code).toBe('MSG-13');
    expect(await prisma.mediaFile.findUnique({ where: { id: fileId } })).toBeNull();
    expect(fs.existsSync(objectPath)).toBe(false);
  });

  it('ITC022 - Ảnh PNG đổi đuôi thành mp3 bị từ chối ở bước confirm', async () => {
    const fileId = await TestContext.upload(lecturer, 'AUDIO', 'ghi-am.mp3', 'audio/mpeg', SampleMediaFactory.tinyPng);

    const confirm = await request(app).post(`${api}/uploads/${fileId}/confirm`).set(TestContext.auth(lecturer));

    expect(confirm.status).toBe(400);
    expect(confirm.body.code).toBe('MSG-13');
    expect(await prisma.mediaFile.findUnique({ where: { id: fileId } })).toBeNull();
  });

  it('ITC023 - Confirm PDF và WAV thật thì ghi nhận pageCount và durationSec', async () => {
    const pdfId = await TestContext.uploadPdf(lecturer, 'Ban nhac');
    const pdfConfirm = await request(app).post(`${api}/uploads/${pdfId}/confirm`).set(TestContext.auth(lecturer));

    expect(pdfConfirm.status).toBe(200);
    expect(pdfConfirm.body.data).toMatchObject({ pageCount: 3, mimeType: 'application/pdf' });
    expect(pdfConfirm.body.data.durationSec).toBeNull();

    const wavId = await TestContext.uploadWav(lecturer, 7);
    const wavConfirm = await request(app).post(`${api}/uploads/${wavId}/confirm`).set(TestContext.auth(lecturer));

    expect(wavConfirm.status).toBe(200);
    expect(wavConfirm.body.data.durationSec).toBe(7);
    expect(wavConfirm.body.data.pageCount).toBeNull();

    const rows = await prisma.mediaFile.findMany({ where: { id: { in: [pdfId, wavId] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'READY')).toBe(true);
  });

  it('ITC024 - Bản thu dài hơn giới hạn cấu hình thì trả MSG-15', async () => {
    await prisma.systemConfig.create({ data: {
      key: 'upload.audio.max_duration_sec', value: '5', label: 'Audio max duration', valueType: 'NUMBER', group: 'FILE_LIMIT'
    } });
    const fileId = await TestContext.uploadWav(lecturer, 8);

    const confirm = await request(app).post(`${api}/uploads/${fileId}/confirm`).set(TestContext.auth(lecturer));

    expect(confirm.status).toBe(400);
    expect(confirm.body).toMatchObject({
      code: 'MSG-15',
      message: 'Thời lượng bản thu phải nằm trong khoảng từ 0:01 đến 0:05.'
    });
    expect(await prisma.mediaFile.findUnique({ where: { id: fileId } })).toBeNull();
  });

  it('ITC025 - PUT nội dung kiểm tra token, chủ sở hữu, dung lượng và trạng thái', async () => {
    const other = await TestContext.createUser('LECTURER', 'upload-khac@test.local');
    const presign = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'SHEET', fileName: 'muoi-byte.pdf', mimeType: 'application/pdf', size: 10 });
    expect(presign.status).toBe(201);
    const { fileId, uploadUrl } = presign.body.data;
    const contentPath = new URL(uploadUrl).pathname;
    const body = Buffer.alloc(10, 0x20);

    const anonymous = await request(app).put(contentPath).set('Content-Type', 'application/pdf').send(body);
    expect(anonymous.status).toBe(401);

    const foreign = await request(app).put(contentPath).set(TestContext.auth(other))
      .set('Content-Type', 'application/pdf').send(body);
    expect(foreign.status).toBe(400);

    const oversized = await request(app).put(contentPath).set(TestContext.auth(lecturer))
      .set('Content-Type', 'application/pdf').send(Buffer.alloc(64, 0x20));
    expect(oversized.status).toBe(413);

    const accepted = await request(app).put(contentPath).set(TestContext.auth(lecturer))
      .set('Content-Type', 'application/pdf').send(body);
    expect(accepted.status).toBe(200);

    await prisma.mediaFile.update({ where: { id: fileId }, data: { status: 'READY' } });
    const closed = await request(app).put(contentPath).set(TestContext.auth(lecturer))
      .set('Content-Type', 'application/pdf').send(body);
    expect(closed.status).toBe(409);
    expect(closed.body.message).toContain('Không thể tải file lên');
  });

  it('ITC026 - Giảng viên khác không confirm được file của người khác', async () => {
    const other = await TestContext.createUser('LECTURER', 'upload-khac-2@test.local');
    const fileId = await TestContext.uploadPdf(lecturer);

    const confirm = await request(app).post(`${api}/uploads/${fileId}/confirm`).set(TestContext.auth(other));

    expect(confirm.status).toBe(400);
    expect(confirm.body.code).toBe('MSG-08');
    const mediaFile = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(mediaFile.uploadedById).toBe(lecturer.id);
    expect(mediaFile.status).toBe('PENDING');
  });

  it('ITC027 - Luồng đầy đủ presign, PUT, confirm rồi tải file', async () => {
    const pdf = await SampleMediaFactory.createPdf('Full flow', 3);
    const presign = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'SHEET', fileName: 'full-flow.pdf', mimeType: 'application/pdf', size: pdf.length });
    expect(presign.status).toBe(201);
    const { fileId, uploadUrl } = presign.body.data;

    const put = await request(app).put(new URL(uploadUrl).pathname).set(TestContext.auth(lecturer))
      .set('Content-Type', 'application/pdf').send(pdf);
    expect(put.status).toBe(200);

    const confirm = await request(app).post(`${api}/uploads/${fileId}/confirm`).set(TestContext.auth(lecturer));
    expect(confirm.status).toBe(200);
    expect(confirm.body.data).toMatchObject({ pageCount: 3, mimeType: 'application/pdf' });

    const mediaFile = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(mediaFile.status).toBe('READY');
    expect(fs.existsSync(path.join(storageRoot, mediaFile.storageKey))).toBe(true);

    const download = await request(app).get(new URL(confirm.body.data.url).pathname)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(Buffer.compare(download.body, pdf)).toBe(0);
  });
});
