import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import SampleMediaFactory from '../prisma/seed/SampleMediaFactory.ts';
import TestContext from './support/TestContext.ts';

const { app, api } = TestContext;

describe('Upload & kiểm tra file (GBR-43)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;

  beforeEach(async () => {
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'gv@test.local');
  });

  it('sai định dạng (theo đuôi) → MSG-13', async () => {
    const response = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'SHEET', fileName: 'ban-nhac.docx', mimeType: 'application/msword', size: 1000 });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'MSG-13',
      message: 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng PDF, PNG, JPG.'
    });
  });

  it('vượt dung lượng → MSG-14 (giới hạn đọc từ system_config)', async () => {
    const response = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'AUDIO', fileName: 'thu.mp3', mimeType: 'audio/mpeg', size: 21 * 1024 * 1024 });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'MSG-14', message: 'File vượt quá dung lượng tối đa 20 MB.' });

    await TestContext.prisma.systemConfig.create({ data: { key: 'upload.sheet.max_mb', value: '1', label: 'Sheet max MB', valueType: 'NUMBER', group: 'FILE_LIMIT' } });
    const configured = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'SHEET', fileName: 'a.pdf', mimeType: 'application/pdf', size: 2 * 1024 * 1024 });
    expect(configured.body.message).toBe('File vượt quá dung lượng tối đa 1 MB.');
  });

  it('file đổi đuôi nhưng nội dung thật sai → MSG-13 khi xác nhận, file bị xóa', async () => {
    const fileId = await TestContext.upload(lecturer, 'SHEET', 'gia-mao.pdf', 'application/pdf', Buffer.from('plain text pretending to be a pdf'));
    const confirm = await request(app).post(`${api}/uploads/${fileId}/confirm`).set(TestContext.auth(lecturer));
    expect(confirm.status).toBe(400);
    expect(confirm.body.code).toBe('MSG-13');
    expect(await TestContext.prisma.mediaFile.findUnique({ where: { id: fileId } })).toBeNull();
  });

  it('ảnh PNG đổi đuôi thành .mp3 → MSG-13', async () => {
    const fileId = await TestContext.upload(lecturer, 'AUDIO', 'thu.mp3', 'audio/mpeg', SampleMediaFactory.tinyPng);
    const confirm = await request(app).post(`${api}/uploads/${fileId}/confirm`).set(TestContext.auth(lecturer));
    expect(confirm.body.code).toBe('MSG-13');
  });

  it('xác nhận file hợp lệ: đọc số trang PDF và thời lượng audio ở server', async () => {
    const pdfId = await TestContext.uploadPdf(lecturer);
    const pdf = await request(app).post(`${api}/uploads/${pdfId}/confirm`).set(TestContext.auth(lecturer));
    expect(pdf.status).toBe(200);
    expect(pdf.body.data).toMatchObject({ pageCount: 3, mimeType: 'application/pdf' });

    const wavId = await TestContext.uploadWav(lecturer, 7);
    const wav = await request(app).post(`${api}/uploads/${wavId}/confirm`).set(TestContext.auth(lecturer));
    expect(wav.body.data.durationSec).toBe(7);
  });

  it('bản thu dài hơn giới hạn → MSG-15', async () => {
    await TestContext.prisma.systemConfig.create({ data: { key: 'upload.audio.max_duration_sec', value: '5', label: 'Audio max seconds', valueType: 'NUMBER', group: 'FILE_LIMIT' } });
    const wavId = await TestContext.uploadWav(lecturer, 8);
    const confirm = await request(app).post(`${api}/uploads/${wavId}/confirm`).set(TestContext.auth(lecturer));
    expect(confirm.body).toMatchObject({ code: 'MSG-15', message: 'Thời lượng bản thu phải nằm trong khoảng từ 0:01 đến 0:05.' });
  });

  it('PUT nội dung: cần token của người tạo file, không vượt dung lượng khai báo, chỉ khi file còn PENDING', async () => {
    const presign = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'SHEET', fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 });
    expect(presign.body.data).toMatchObject({ method: 'PUT', uploadUrl: `http://localhost:3000/api/v1/uploads/${presign.body.data.fileId}/content` });
    const contentPath = new URL(presign.body.data.uploadUrl).pathname;
    const put = (headers: Record<string, string>, body: Buffer) => request(app).put(contentPath).set(headers).set('Content-Type', 'application/pdf').send(body);

    expect((await put({}, Buffer.from('x'))).status).toBe(401);
    const other = await TestContext.createUser('LECTURER', 'gv2@test.local');
    expect((await put(TestContext.auth(other), Buffer.from('x'))).status).toBe(400);
    expect((await put(TestContext.auth(lecturer), Buffer.alloc(11))).status).toBe(413);
    expect((await put(TestContext.auth(lecturer), Buffer.alloc(10))).status).toBe(200);

    await TestContext.prisma.mediaFile.update({ where: { id: presign.body.data.fileId }, data: { status: 'READY' } });
    expect((await put(TestContext.auth(lecturer), Buffer.alloc(10))).status).toBe(409);
  });

  it('giảng viên khác không xác nhận được file', async () => {
    const presign = await request(app).post(`${api}/uploads/presign`).set(TestContext.auth(lecturer))
      .send({ kind: 'SHEET', fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 });
    const other = await TestContext.createUser('LECTURER', 'gv2@test.local');
    const confirm = await request(app).post(`${api}/uploads/${presign.body.data.fileId}/confirm`).set(TestContext.auth(other));
    expect(confirm.status).toBe(400);
  });
});
