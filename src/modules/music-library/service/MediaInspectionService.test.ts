/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import SampleMediaFactory from '../../../../prisma/seed/SampleMediaFactory.ts';
import LocalStorageDriver from '../../../lib/storage/LocalStorageDriver.ts';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import CatalogRepository from '../repository/CatalogRepository.ts';
import MediaInspectionService from './MediaInspectionService.ts';

const MB = 1024 * 1024;
const SHEET_FORMATS = 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng PDF, PNG, JPG.';
const NOT_UPLOADED = 'Không thể gắn file vì file chưa được tải lên hoặc không thuộc về bạn.';
const inspection = MediaInspectionService as any;
const originalDriver = StorageService.driverInstance;

// Thư mục lưu trữ tạm chứa file thật cho inspect / detectExtension / countPages / readDuration
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bvc-inspect-'));

function putFile(storageKey: string, content: Buffer): void {
  fs.mkdirSync(path.dirname(path.join(storageRoot, storageKey)), { recursive: true });
  fs.writeFileSync(path.join(storageRoot, storageKey), content);
}

function createSheetRules(overrides: Record<string, unknown> = {}): any {
  return { extensions: ['pdf', 'png', 'jpg', 'jpeg'], formatLabel: 'PDF, PNG, JPG', maxMb: 10, maxBytes: 10 * MB, ...overrides };
}

function createSheetFile(storageKey: string): any {
  return {
    id: 'f1', kind: 'SHEET', status: 'PENDING', storageKey, originalName: path.basename(storageKey), mimeType: 'application/pdf',
    sizeBytes: 1000, durationSec: null, pageCount: null, uploadedById: 'GV-A', createdAt: new Date()
  };
}

function createAudioFile(storageKey: string): any {
  return {
    id: 'a1', kind: 'AUDIO', status: 'PENDING', storageKey, originalName: path.basename(storageKey), mimeType: 'audio/wav',
    sizeBytes: 1000, durationSec: null, pageCount: null, uploadedById: 'GV-A', createdAt: new Date()
  };
}

function mockConfigValues(values: Record<string, string> = {}) {
  return mock.method(CatalogRepository, 'findConfigValues', async (keys: string[]) =>
    keys.filter((key) => key in values).map((key) => ({ key, value: values[key] })) as any
  );
}

function isAppError(statusCode: number, code: string, message: string, field?: string) {
  return (err: unknown) =>
    err instanceof AppError && err.statusCode === statusCode && err.code === code && err.message === message && err.field === field;
}

describe('MediaInspectionService (Kiểm tra file tải lên)', () => {
  before(async () => {
    putFile('sheet/p3.pdf', await SampleMediaFactory.createPdf('Ly ngua o', 3));
    putFile('sheet/p1.png', SampleMediaFactory.tinyPng);
    putFile('sheet/fake.pdf', Buffer.from('Day khong phai PDF, chi la van ban.'.repeat(20)));
    putFile('audio/w7.wav', SampleMediaFactory.createWav(7));
    putFile('audio/w8.wav', SampleMediaFactory.createWav(8));
  });

  after(() => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    StorageService.driverInstance = originalDriver;
    mock.restoreAll();
  });

  function useTempStorage(): void {
    StorageService.driverInstance = new LocalStorageDriver(storageRoot);
  }

  describe('getExtension / formatDuration', () => {
    it('lấy phần mở rộng viết thường', () => {
      assert.equal(MediaInspectionService.getExtension('ban-nhac.PDF'), 'pdf');
    });

    it('tên file không có phần mở rộng thì trả về chuỗi rỗng', () => {
      assert.equal(MediaInspectionService.getExtension('README'), '');
    });

    it('định dạng 65 giây thành "1:05"', () => {
      assert.equal(MediaInspectionService.formatDuration(65), '1:05');
    });

    it('giá trị biên: làm tròn 59.6 giây thành "1:00"', () => {
      assert.equal(MediaInspectionService.formatDuration(59.6), '1:00');
    });
  });

  describe('assertDeclaredFile', () => {
    it('chấp nhận file PDF đúng định dạng và dung lượng', () => {
      assert.doesNotThrow(() => inspection.assertDeclaredFile('ban-nhac.pdf', 1000, createSheetRules()));
    });

    it('báo lỗi 400 MSG-13 khi định dạng file không được hỗ trợ', async () => {
      await assert.rejects(async () => inspection.assertDeclaredFile('ban-nhac.docx', 1000, createSheetRules()), isAppError(400, 'MSG-13', SHEET_FORMATS, 'file'));
    });

    it('giá trị biên: chấp nhận file đúng bằng dung lượng tối đa 10 MB', () => {
      assert.doesNotThrow(() => inspection.assertDeclaredFile('a.pdf', 10 * MB, createSheetRules()));
    });

    it('giá trị biên: báo lỗi 400 MSG-14 khi vượt dung lượng tối đa 1 byte', async () => {
      await assert.rejects(
        async () => inspection.assertDeclaredFile('a.pdf', 10 * MB + 1, createSheetRules()),
        isAppError(400, 'MSG-14', 'File vượt quá dung lượng tối đa 10 MB.', 'file')
      );
    });
  });

  describe('inspect', () => {
    it('đếm đúng 3 trang của file PDF thật', async () => {
      useTempStorage();
      mockConfigValues();

      const result: any = await MediaInspectionService.inspect(createSheetFile('sheet/p3.pdf'));

      assert.equal(result.pageCount, 3);
      assert.equal(result.durationSec, null);
      assert.equal(result.sizeBytes, fs.statSync(path.join(storageRoot, 'sheet/p3.pdf')).size);
    });

    it('đọc đúng thời lượng 7 giây của file WAV', async () => {
      useTempStorage();
      mockConfigValues();

      const result: any = await MediaInspectionService.inspect(createAudioFile('audio/w7.wav'));

      assert.equal(result.durationSec, 7);
    });

    it('báo lỗi 400 MSG-08 khi file chưa được tải lên storage', async () => {
      useTempStorage();
      mockConfigValues();

      await assert.rejects(MediaInspectionService.inspect(createSheetFile('sheet/missing.pdf')), isAppError(400, 'MSG-08', NOT_UPLOADED, 'file'));
    });

    it('báo lỗi 400 MSG-14 khi file vượt dung lượng đã cấu hình 0.001 MB', async () => {
      useTempStorage();
      mockConfigValues({ 'upload.sheet.max_mb': '0.001' });

      await assert.rejects(
        MediaInspectionService.inspect(createSheetFile('sheet/p3.pdf')),
        isAppError(400, 'MSG-14', 'File vượt quá dung lượng tối đa 0.001 MB.', 'file')
      );
    });

    it('báo lỗi 400 MSG-13 khi file văn bản bị đổi tên thành .pdf', async () => {
      useTempStorage();
      mockConfigValues();

      await assert.rejects(MediaInspectionService.inspect(createSheetFile('sheet/fake.pdf')), isAppError(400, 'MSG-13', SHEET_FORMATS, 'file'));
    });

    it('báo lỗi 400 MSG-15 khi bản thu dài hơn thời lượng tối đa đã cấu hình 5 giây', async () => {
      useTempStorage();
      mockConfigValues({ 'upload.audio.max_duration_sec': '5' });

      await assert.rejects(
        MediaInspectionService.inspect(createAudioFile('audio/w8.wav')),
        isAppError(400, 'MSG-15', 'Thời lượng bản thu phải nằm trong khoảng từ 0:01 đến 0:05.', 'file')
      );
    });
  });

  describe('detectExtension / isAcceptedType', () => {
    it('không nhận diện được magic bytes của file văn bản', async () => {
      useTempStorage();

      assert.equal(await inspection.detectExtension('sheet/fake.pdf'), undefined);
    });

    it('chấp nhận PDF cho file SHEET', () => {
      assert.equal(inspection.isAcceptedType({ kind: 'SHEET', originalName: 'a.pdf' }, 'pdf'), true);
    });

    it('từ chối ảnh PNG bị đổi tên thành .mp3', () => {
      assert.equal(inspection.isAcceptedType({ kind: 'AUDIO', originalName: 'thu.mp3' }, 'png'), false);
    });

    it('từ chối video MP4 bị đổi tên thành .mp3', () => {
      assert.equal(inspection.isAcceptedType({ kind: 'AUDIO', originalName: 'thu.mp3' }, 'mp4'), false);
    });
  });

  describe('countPages / readDuration / assertAudioDuration', () => {
    it('giá trị biên: ảnh PNG được tính là 1 trang', async () => {
      useTempStorage();

      assert.equal(await inspection.countPages(createSheetFile('sheet/p1.png'), 'png', createSheetRules()), 1);
    });

    it('đọc thời lượng 7 giây của file WAV', async () => {
      useTempStorage();
      const sizeBytes = fs.statSync(path.join(storageRoot, 'audio/w7.wav')).size;

      assert.equal(await inspection.readDuration(createAudioFile('audio/w7.wav'), sizeBytes, createSheetRules({ formatLabel: 'MP3, WAV, M4A' })), 7);
    });

    it('chấp nhận bản thu 120 giây (trong khoảng mặc định 1 – 600 giây)', async () => {
      mockConfigValues();

      await assert.doesNotReject(inspection.assertAudioDuration(120));
    });

    it('giá trị biên: báo lỗi 400 MSG-15 khi bản thu dài 601 giây', async () => {
      mockConfigValues();

      await assert.rejects(
        inspection.assertAudioDuration(601),
        isAppError(400, 'MSG-15', 'Thời lượng bản thu phải nằm trong khoảng từ 0:01 đến 10:00.', 'file')
      );
    });
  });
});
