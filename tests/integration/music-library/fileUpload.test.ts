import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import SampleMediaFactory from '../../../prisma/seed/SampleMediaFactory.ts';
import TestContext from '../../support/TestContext.ts';
import F from './MusicLibraryFixture.ts';

type TestUser = Awaited<ReturnType<typeof TestContext.createUser>>;
const { prisma } = TestContext;
const M = F.messages;
const pdfPresign = { kind: 'SHEET', fileName: 'a.pdf', mimeType: 'application/pdf' };
const tenBytes = Buffer.alloc(10, 1);

describe('Report 5.2 – File Upload (GBR-43)', () => {
  let gvA: TestUser;
  let gvB: TestUser;
  let sv1: TestUser;

  beforeEach(async () => {
    await TestContext.reset();
    gvA = await TestContext.createUser('LECTURER', 'gv.a@test.local');
    gvB = await TestContext.createUser('LECTURER', 'gv.b@test.local');
    sv1 = await TestContext.createUser('STUDENT', 'sv.1@test.local');
  });

  // ITC-UP-004 state: GV-A has a PENDING file $F1 declared as 10 bytes
  async function pendingTenByteFile() {
    const response = await F.presign(gvA, { ...pdfPresign, size: 10 });
    if (response.status !== 201) throw new Error(`presign failed: ${JSON.stringify(response.body)}`);
    return response.body.data.fileId as string;
  }

  async function expectRemoved(fileId: string, storageKey: string) {
    expect(await prisma.mediaFile.findUnique({ where: { id: fileId } })).toBeNull();
    expect(F.storedFileExists(storageKey)).toBe(false);
  }

  describe('Get an upload link (POST /api/v1/uploads/presign)', () => {
    it('ITC-UP-001 an extension outside the allowed list → MSG-13', async () => {
      const response = await F.presign(gvA, { kind: 'SHEET', fileName: 'ban-nhac.docx', mimeType: 'application/msword', size: 1000 });
      F.expectError(response, 400, { code: 'MSG-13', field: 'file', message: 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng PDF, PNG, JPG.' });
      expect(await prisma.mediaFile.count()).toBe(0);
    });

    it('ITC-UP-002 a size above the default recording limit (20 MB) → MSG-14', async () => {
      const response = await F.presign(gvA, { kind: 'AUDIO', fileName: 'thu.mp3', mimeType: 'audio/mpeg', size: 22020096 });
      F.expectError(response, 400, { code: 'MSG-14', field: 'file', message: 'File vượt quá dung lượng tối đa 20 MB.' });
    });

    it('ITC-UP-003 the size limit is read from system_configs', async () => {
      await F.setConfig('upload.sheet.max_mb', '1');
      F.expectError(await F.presign(gvA, { ...pdfPresign, size: 2097152 }), 400, { code: 'MSG-14', field: 'file', message: 'File vượt quá dung lượng tối đa 1 MB.' });
      const allowed = await F.presign(gvA, { ...pdfPresign, size: 1048576 });
      expect(allowed.status).toBe(201);
      expect(allowed.body.data.maxSizeBytes).toBe(1048576);
    });

    it('ITC-UP-004 a valid presign returns the PUT URL, a 15-minute expiry and a PENDING row', async () => {
      const response = await F.presign(gvA, { ...pdfPresign, size: 10 });
      expect(response.status).toBe(201);
      const fileId = response.body.data.fileId;
      expect(response.body.data).toMatchObject({
        fileId,
        method: 'PUT',
        uploadUrl: `http://localhost:3000/api/v1/uploads/${fileId}/content`,
        headers: { 'Content-Type': 'application/pdf' },
        maxSizeBytes: 10485760
      });
      const stored = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      expect(new Date(response.body.data.expiresAt).getTime() - stored.createdAt.getTime()).toBe(15 * 60 * 1000);
      expect([stored.kind, stored.status, stored.sizeBytes, stored.uploadedById]).toEqual(['SHEET', 'PENDING', 10, gvA.id]);
      expect(stored.storageKey).toMatch(/^sheet\/\d{4}-\d{2}\/[0-9a-f-]{36}\.pdf$/);
    });

    it('ITC-UP-013 sheet size bound: exactly 10 MB accepted, 1 more byte rejected', async () => {
      const atLimit = await F.presign(gvA, { ...pdfPresign, size: 10485760 });
      expect(atLimit.status).toBe(201);
      expect(atLimit.body.data.maxSizeBytes).toBe(10485760);
      F.expectError(await F.presign(gvA, { ...pdfPresign, size: 10485761 }), 400, { code: 'MSG-14', field: 'file', message: 'File vượt quá dung lượng tối đa 10 MB.' });
    });

    it('ITC-UP-014 per-kind limits: .gif cover wrong format, 201 MB video too large', async () => {
      F.expectError(await F.presign(gvA, { kind: 'COVER', fileName: 'bia.gif', mimeType: 'image/gif', size: 1000 }), 400,
        { code: 'MSG-13', field: 'file', message: 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng JPG, PNG, WebP.' });
      const webp = await F.presign(gvA, { kind: 'COVER', fileName: 'bia.webp', mimeType: 'image/webp', size: 5242880 });
      expect(webp.status).toBe(201);
      expect(webp.body.data.maxSizeBytes).toBe(5242880);
      F.expectError(await F.presign(gvA, { kind: 'VIDEO', fileName: 'huong-dan.mp4', mimeType: 'video/mp4', size: 210763776 }), 400,
        { code: 'MSG-14', field: 'file', message: 'File vượt quá dung lượng tối đa 200 MB.' });
    });

    it('ITC-UP-015 a malformed presign body: unknown kind, empty file name, size 0', async () => {
      F.expectValidationError(await F.presign(gvA, { ...pdfPresign, kind: 'DOC', size: 10 }), 'kind');
      F.expectError(await F.presign(gvA, { ...pdfPresign, fileName: '', size: 10 }), 400, { code: 'MSG-35', field: 'fileName', message: 'Tên file không được để trống.' });
      F.expectValidationError(await F.presign(gvA, { ...pdfPresign, size: 0 }), 'size');
      expect((await F.presign(gvA, { ...pdfPresign, size: 1 })).status).toBe(201);
    });

    it('ITC-UP-016 a Student cannot request an upload URL', async () => {
      F.expectForbidden(await F.presign(sv1, { ...pdfPresign, size: 10 }));
    });
  });

  describe('Upload the file content (PUT /api/v1/uploads/:id/content)', () => {
    it('ITC-UP-005 PUT content needs a token and only the creator may upload', async () => {
      const fileId = await pendingTenByteFile();
      F.expectUnauthorized(await F.putContent(fileId, tenBytes));
      F.expectError(await F.putContent(fileId, tenBytes, gvB), 400, { code: 'MSG-08', field: 'fileId', message: M.fileNotOwned });
    });

    it('ITC-UP-006 content larger than declared → 413 and removed; the exact size is accepted', async () => {
      const fileId = await pendingTenByteFile();
      F.expectError(await F.putContent(fileId, Buffer.alloc(11, 1), gvA), 413,
        { code: 'MSG-08', field: 'file', message: 'Không thể tải file lên vì file vượt quá dung lượng đã khai báo.' });
      const accepted = await F.putContent(fileId, tenBytes, gvA);
      expect(accepted.status).toBe(200);
      expect(accepted.body.data).toMatchObject({ fileId });
      const stored = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      expect(stored.storageKey.startsWith('sheet/')).toBe(true);
      expect(fs.statSync(F.storagePath(stored.storageKey)).size).toBe(10);
    });

    it('ITC-UP-007 content can only be uploaded while the file is PENDING', async () => {
      const fileId = await pendingTenByteFile();
      await prisma.mediaFile.update({ where: { id: fileId }, data: { status: 'READY' } });
      F.expectError(await F.putContent(fileId, tenBytes, gvA), 409, { code: 'MSG-08', field: 'fileId', message: M.uploadClosed });
    });

    it('ITC-UP-017 the 15-minute upload window', async () => {
      const fileId = await pendingTenByteFile();
      await prisma.mediaFile.update({ where: { id: fileId }, data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
      F.expectError(await F.putContent(fileId, tenBytes, gvA), 409, { code: 'MSG-08', field: 'fileId', message: M.uploadClosed });
      await prisma.mediaFile.update({ where: { id: fileId }, data: { createdAt: new Date(Date.now() - (14 * 60 + 50) * 1000) } });
      expect((await F.putContent(fileId, tenBytes, gvA)).status).toBe(200);
    });

    it('ITC-UP-018 an unknown file id returns the not-uploaded error', async () => {
      F.expectError(await F.putContent(F.zeroId, tenBytes, gvA), 400, { code: 'MSG-08', field: 'fileId', message: M.fileNotOwned });
      F.expectError(await F.post(`/uploads/${F.zeroId}/confirm`, {}, gvA), 400, { code: 'MSG-08', field: 'fileId', message: M.fileNotOwned });
    });
  });

  describe('Confirm the file (POST /api/v1/uploads/:id/confirm)', () => {
    it('ITC-UP-008 a text file renamed to .pdf is caught by magic bytes and deleted', async () => {
      const fileId = await F.uploadFile(gvA, 'SHEET', 'gia-mao.pdf', 'application/pdf', Buffer.from('plain text pretending to be a pdf'), false);
      const { storageKey } = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      F.expectError(await F.post(`/uploads/${fileId}/confirm`, {}, gvA), 400,
        { code: 'MSG-13', field: 'file', message: 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng PDF, PNG, JPG.' });
      await expectRemoved(fileId, storageKey);
    });

    it('ITC-UP-009 a PNG renamed to .mp3 is rejected on confirm', async () => {
      const fileId = await F.uploadFile(gvA, 'AUDIO', 'thu.mp3', 'audio/mpeg', SampleMediaFactory.tinyPng, false);
      const { storageKey } = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      F.expectError(await F.post(`/uploads/${fileId}/confirm`, {}, gvA), 400,
        { code: 'MSG-13', field: 'file', message: 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng MP3, WAV, M4A.' });
      await expectRemoved(fileId, storageKey);
    });

    it('ITC-UP-010 the server reads the real PDF page count and audio duration', async () => {
      const pdfId = await F.pdf(gvA, 3, false);
      const pdf = await F.post(`/uploads/${pdfId}/confirm`, {}, gvA);
      expect(pdf.status).toBe(200);
      expect(pdf.body.data).toMatchObject({ pageCount: 3, mimeType: 'application/pdf', durationSec: null });
      expect(pdf.body.data.url.startsWith('http://localhost:3000/uploads/sheet/')).toBe(true);
      expect((await prisma.mediaFile.findUniqueOrThrow({ where: { id: pdfId } })).status).toBe('READY');

      const wavId = await F.wav(gvA, 7, false);
      const wav = await F.post(`/uploads/${wavId}/confirm`, {}, gvA);
      expect(wav.status).toBe(200);
      expect(wav.body.data).toMatchObject({ durationSec: 7, pageCount: null });
    });

    it('ITC-UP-011 a recording longer than the configured limit → MSG-15', async () => {
      await F.setConfig('upload.audio.max_duration_sec', '5');
      const fileId = await F.wav(gvA, 8, false);
      const { storageKey } = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      F.expectError(await F.post(`/uploads/${fileId}/confirm`, {}, gvA), 400,
        { code: 'MSG-15', field: 'file', message: 'Thời lượng bản thu phải nằm trong khoảng từ 0:01 đến 0:05.' });
      await expectRemoved(fileId, storageKey);
    });

    it('ITC-UP-012 another lecturer cannot confirm GV-A file', async () => {
      const fileId = await pendingTenByteFile();
      F.expectError(await F.post(`/uploads/${fileId}/confirm`, {}, gvB), 400, { code: 'MSG-08', field: 'fileId', message: M.fileNotOwned });
      expect((await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } })).status).toBe('PENDING');
    });

    it('ITC-UP-019 confirming twice returns the same READY result', async () => {
      const fileId = await F.pdf(gvA, 3, false);
      const first = await F.post(`/uploads/${fileId}/confirm`, {}, gvA);
      const second = await F.post(`/uploads/${fileId}/confirm`, {}, gvA);
      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({ id: fileId, pageCount: 3 });
      expect(second.body.data).toEqual(first.body.data);
    });

    it('ITC-UP-020 confirming before PUT content reports not uploaded and deletes the PENDING row', async () => {
      const fileId = await pendingTenByteFile();
      const { storageKey } = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      F.expectError(await F.post(`/uploads/${fileId}/confirm`, {}, gvA), 400, { code: 'MSG-08', field: 'file', message: M.fileNotOwned });
      await expectRemoved(fileId, storageKey);
      F.expectError(await F.putContent(fileId, tenBytes, gvA), 400, { code: 'MSG-08', field: 'fileId', message: M.fileNotOwned });
    });

    it('ITC-UP-021 the minimum duration bound read from system_configs', async () => {
      await F.setConfig('upload.audio.min_duration_sec', '3');
      const tooShort = await F.wav(gvA, 2, false);
      F.expectError(await F.post(`/uploads/${tooShort}/confirm`, {}, gvA), 400,
        { code: 'MSG-15', field: 'file', message: 'Thời lượng bản thu phải nằm trong khoảng từ 0:03 đến 10:00.' });
      const atMinimum = await F.wav(gvA, 3, false);
      const accepted = await F.post(`/uploads/${atMinimum}/confirm`, {}, gvA);
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.durationSec).toBe(3);
    });

    it('ITC-UP-022 the real size is checked again on confirm when the limit was lowered', async () => {
      const fileId = await F.pdf(gvA, 3, false);
      const { storageKey } = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      await F.setConfig('upload.sheet.max_mb', '0.001');
      F.expectError(await F.post(`/uploads/${fileId}/confirm`, {}, gvA), 400, { code: 'MSG-14', field: 'file', message: 'File vượt quá dung lượng tối đa 0.001 MB.' });
      await expectRemoved(fileId, storageKey);
    });

    it('ITC-UP-023 a PENDING file is confirmed implicitly when attached to a sheet', async () => {
      const piece = await TestContext.createPiece(gvA);
      const fileId = await F.pdf(gvA, 3, false);
      const sheet = await F.createSheet(gvA, piece.id, { name: 'Bản 1', sheetFileId: fileId });
      expect(sheet.status).toBe(201);
      expect(sheet.body.data.files.sheet).toMatchObject({ id: fileId, pageCount: 3 });
      const stored = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      expect([stored.status, stored.pageCount]).toEqual(['READY', 3]);
    });
  });
});
