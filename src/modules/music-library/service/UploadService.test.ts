/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records; private members are reached through a loose handle */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { after, afterEach, beforeEach, describe, it, mock } from 'node:test';
import LocalStorageDriver from '../../../lib/storage/LocalStorageDriver.ts';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import CatalogRepository from '../repository/CatalogRepository.ts';
import MediaFileRepository from '../repository/MediaFileRepository.ts';
import MediaInspectionService from './MediaInspectionService.ts';
import UploadService from './UploadService.ts';

const MB = 1024 * 1024;
const messages = {
  SHEET_FORMATS: 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng PDF, PNG, JPG.',
  UPLOAD_CLOSED: 'Không thể tải file lên vì file đã được xác nhận hoặc phiên tải lên đã hết hạn.',
  UPLOAD_TOO_LARGE: 'Không thể tải file lên vì file vượt quá dung lượng đã khai báo.',
  FILE_KIND: 'Không thể gắn file vì loại file không đúng với ô đã chọn.',
  FILE_USED: 'Không thể gắn file vì file này đã được dùng ở nơi khác.'
};

// pitchTrimmer là private
const uploadService = UploadService as any;
const originalDriver = StorageService.driverInstance;
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bvc-upload-'));
const inspectedSheet = { sizeBytes: 1000, durationSec: null, pageCount: 3 };
const firstInspection = { sizeBytes: 900, durationSec: 6, pageCount: null };

function createMediaFile(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'f1',
    kind: 'SHEET',
    status: 'READY',
    storageKey: 'sheet/2026-11/f1.pdf',
    originalName: 'ban-nhac.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    durationSec: null,
    pageCount: 3,
    uploadedById: 'GV-A',
    createdAt: new Date(),
    ...overrides
  };
}

function createAudioFile(overrides: Record<string, unknown> = {}): any {
  return createMediaFile({
    id: 'a1', kind: 'AUDIO', storageKey: 'audio/2026-11/a1.wav', originalName: 'ban-thu.wav', mimeType: 'audio/wav', durationSec: 6, pageCount: null, ...overrides
  });
}

function createPendingFile(overrides: Record<string, unknown> = {}): any {
  return createMediaFile({ status: 'PENDING', pageCount: null, ...overrides });
}

function mockConfigValues(values: Record<string, string> = {}) {
  return mock.method(CatalogRepository, 'findConfigValues', async (keys: string[]) =>
    keys.filter((key) => key in values).map((key) => ({ key, value: values[key] })) as any
  );
}

function mockFindFile(record: unknown) {
  return mock.method(MediaFileRepository, 'findById', async () => record as any);
}

function mockCreateMediaFile() {
  return mock.method(MediaFileRepository, 'create', async (data: any) =>
    createMediaFile({ id: 'f1', status: 'PENDING', ...data, createdAt: new Date('2026-11-07T01:00:00Z') })
  );
}

// Driver giả cho storeContent: ghi lại maxBytes của mỗi lần writeStream
function mockWriteStream(writeStream: (maxBytes: number) => Promise<number>) {
  const writeMock = mock.fn(async (_key: string, _source: unknown, maxBytes: number) => writeStream(maxBytes));
  StorageService.driverInstance = { writeStream: writeMock } as any;
  return writeMock;
}

function mockConfirmFlow(
  inspect: () => Promise<unknown>,
  markReady: (id: string, inspected: any) => Promise<unknown> = async (id, inspected) => createMediaFile({ id, ...inspected, status: 'READY' })
) {
  const inspectMock = mock.method(MediaInspectionService, 'inspect', inspect as any);
  const markReadyMock = mock.method(MediaFileRepository, 'markReady', markReady as any);
  const deleteMock = mock.method(MediaFileRepository, 'deleteById', async () => undefined as any);
  const deleteQuietlyMock = mock.method(StorageService, 'deleteQuietly', async () => undefined);
  mock.method(StorageService.driver, 'readObject', async () => Buffer.from('audio'));
  mock.method(uploadService.pitchTrimmer, 'trimBuffer', async () => null);
  return { inspectMock, markReadyMock, deleteMock, deleteQuietlyMock };
}

function mockTrimFlow(trimmed: unknown, putObject: () => Promise<unknown> = async () => undefined) {
  const putMock = mock.method(StorageService.driver, 'putObject', putObject as any);
  mock.method(StorageService.driver, 'readObject', async () => Buffer.from('original'));
  const trimMock = mock.method(uploadService.pitchTrimmer, 'trimBuffer', async () => trimmed);
  mock.method(MediaInspectionService, 'inspect', async () => ({ sizeBytes: 500, durationSec: 4, pageCount: null }) as any);
  return { putMock, trimMock };
}

function isAppError(statusCode: number, code: string, message: string, field?: string) {
  return (err: unknown) =>
    err instanceof AppError && err.statusCode === statusCode && err.code === code && err.message === message && err.field === field;
}

describe('UploadService (Tải file lên cho học liệu)', () => {
  beforeEach(() => {
    StorageService.driverInstance = new LocalStorageDriver(storageRoot);
  });

  afterEach(() => {
    StorageService.driverInstance = originalDriver;
    mock.restoreAll();
  });

  after(() => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
  });

  describe('buildStorageKey', () => {
    const month = new Date().toISOString().slice(0, 7);

    it('tạo key theo thư mục loại file, năm-tháng hiện tại và phần mở rộng viết thường', () => {
      assert.match(UploadService.buildStorageKey('SHEET', 'Bản nhạc.PDF'), new RegExp(`^sheet/${month}/[0-9a-f-]{36}\\.pdf$`));
    });

    it('giá trị biên: tên file không có phần mở rộng thì key kết thúc bằng dấu chấm', () => {
      assert.match(UploadService.buildStorageKey('COVER', 'README'), new RegExp(`^cover/${month}/[0-9a-f-]{36}\\.$`));
    });
  });

  describe('createPresignedUpload', () => {
    it('tạo phiên tải lên PUT hết hạn sau 15 phút và lưu bản ghi file PENDING', async () => {
      mockConfigValues();
      const createMock = mockCreateMediaFile();

      const result = await UploadService.createPresignedUpload('GV-A', { kind: 'SHEET', fileName: 'ban-nhac.pdf', mimeType: 'application/pdf', size: 1000 } as any);

      assert.deepEqual(result, {
        fileId: 'f1',
        uploadUrl: 'http://localhost:3000/api/v1/uploads/f1/content',
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        expiresAt: '2026-11-07T01:15:00.000Z',
        maxSizeBytes: 10485760
      });
      const { storageKey, ...rest } = createMock.mock.calls[0].arguments[0] as any;
      assert.match(storageKey, /^sheet\/\d{4}-\d{2}\/[0-9a-f-]{36}\.pdf$/);
      assert.deepEqual(rest, { kind: 'SHEET', originalName: 'ban-nhac.pdf', mimeType: 'application/pdf', sizeBytes: 1000, uploadedById: 'GV-A' });
    });

    it('báo lỗi 400 MSG-13 và KHÔNG tạo bản ghi khi định dạng file không được hỗ trợ', async () => {
      mockConfigValues();
      const createMock = mockCreateMediaFile();

      await assert.rejects(
        UploadService.createPresignedUpload('GV-A', { kind: 'SHEET', fileName: 'ban-nhac.docx', mimeType: 'application/msword', size: 1000 } as any),
        isAppError(400, 'MSG-13', messages.SHEET_FORMATS, 'file')
      );
      assert.equal(createMock.mock.callCount(), 0);
    });

    it('giá trị biên: chấp nhận file đúng bằng 10 MB', async () => {
      mockConfigValues();
      mockCreateMediaFile();

      const result = await UploadService.createPresignedUpload('GV-A', { kind: 'SHEET', fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 * MB } as any);

      assert.equal(result.fileId, 'f1');
    });

    it('giá trị biên: báo lỗi 400 MSG-14 và KHÔNG tạo bản ghi khi vượt 10 MB 1 byte', async () => {
      mockConfigValues();
      const createMock = mockCreateMediaFile();

      await assert.rejects(
        UploadService.createPresignedUpload('GV-A', { kind: 'SHEET', fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 * MB + 1 } as any),
        isAppError(400, 'MSG-14', 'File vượt quá dung lượng tối đa 10 MB.', 'file')
      );
      assert.equal(createMock.mock.callCount(), 0);
    });

    it('dùng dung lượng tối đa cấu hình trong system_configs (AUDIO 25 MB)', async () => {
      mockConfigValues({ 'upload.audio.max_mb': '25' });
      mockCreateMediaFile();

      const result = await UploadService.createPresignedUpload('GV-A', { kind: 'AUDIO', fileName: 'ban-thu.mp3', mimeType: 'audio/mpeg', size: 21 * MB } as any);

      assert.equal(result.maxSizeBytes, 25 * MB);
    });
  });

  describe('getUploadDeadline', () => {
    it('hạn tải lên là 15 phút sau khi tạo', () => {
      const deadline = UploadService.getUploadDeadline(createMediaFile({ createdAt: new Date('2026-11-01T00:00:00Z') }));

      assert.equal(deadline.toISOString(), '2026-11-01T00:15:00.000Z');
    });
  });

  describe('storeContent', () => {
    it('ghi nội dung với giới hạn bằng dung lượng đã khai báo', async () => {
      mockFindFile(createPendingFile({ createdAt: new Date(Date.now() - 60_000) }));
      const writeMock = mockWriteStream(async () => 1000);

      await UploadService.storeContent('GV-A', 'f1', Readable.from([Buffer.alloc(1000)]));

      assert.deepEqual(writeMock.mock.calls.map((call) => call.arguments[2]), [1000]);
    });

    it('báo lỗi 409 MSG-08 khi file đã được xác nhận (READY)', async () => {
      mockFindFile(createMediaFile());

      await assert.rejects(UploadService.storeContent('GV-A', 'f1', Readable.from([])), isAppError(409, 'MSG-08', messages.UPLOAD_CLOSED, 'fileId'));
    });

    it('giá trị biên: báo lỗi 409 MSG-08 khi phiên tải lên đã quá 16 phút', async () => {
      mockFindFile(createPendingFile({ createdAt: new Date(Date.now() - 16 * 60_000) }));

      await assert.rejects(UploadService.storeContent('GV-A', 'f1', Readable.from([])), isAppError(409, 'MSG-08', messages.UPLOAD_CLOSED, 'fileId'));
    });

    it('giá trị biên: vẫn cho tải lên ở giây cuối của phiên (14 phút 59 giây)', async () => {
      mockFindFile(createPendingFile({ createdAt: new Date(Date.now() - (15 * 60_000 - 1000)) }));
      mockWriteStream(async () => 10);

      await assert.doesNotReject(UploadService.storeContent('GV-A', 'f1', Readable.from([Buffer.alloc(10)])));
    });

    it('báo lỗi 413 MSG-08 khi nội dung vượt dung lượng đã khai báo', async () => {
      mockFindFile(createPendingFile());
      mockWriteStream(async () => {
        throw new Error('Upload too large.');
      });

      await assert.rejects(UploadService.storeContent('GV-A', 'f1', Readable.from([])), isAppError(413, 'MSG-08', messages.UPLOAD_TOO_LARGE, 'file'));
    });

    it('giá trị biên: khai báo 300 MB thì bị giới hạn cứng ở 250 MB', async () => {
      mockFindFile(createPendingFile({ sizeBytes: 300 * MB }));
      const writeMock = mockWriteStream(async () => 0);

      await UploadService.storeContent('GV-A', 'f1', Readable.from([]));

      assert.deepEqual(writeMock.mock.calls.map((call) => call.arguments[2]), [250 * MB]);
    });
  });

  describe('findOwnedFile', () => {
    it('trả về file của người tải lên', async () => {
      mockFindFile(createMediaFile());

      const result = await UploadService.findOwnedFile('f1', 'GV-A');

      assert.equal(result.id, 'f1');
    });
  });

  describe('confirmFile / confirmUpload', () => {
    it('file đã READY thì trả về nguyên bản ghi, không kiểm tra lại', async () => {
      const { inspectMock, markReadyMock } = mockConfirmFlow(async () => ({}));

      const result = await UploadService.confirmFile(createMediaFile());

      assert.equal(result.id, 'f1');
      assert.equal(inspectMock.mock.callCount(), 0);
      assert.equal(markReadyMock.mock.callCount(), 0);
    });

    it('kiểm tra file PENDING rồi đánh dấu READY', async () => {
      const { markReadyMock, deleteMock } = mockConfirmFlow(async () => inspectedSheet);

      const result = await UploadService.confirmFile(createPendingFile());

      assert.equal(result.status, 'READY');
      assert.deepEqual(markReadyMock.mock.calls.map((call: any) => call.arguments), [['f1', inspectedSheet]]);
      assert.equal(deleteMock.mock.callCount(), 0);
    });

    it('file không hợp lệ: xóa bản ghi và file trên storage, KHÔNG đánh dấu READY', async () => {
      const { markReadyMock, deleteMock, deleteQuietlyMock } = mockConfirmFlow(async () => {
        throw AppError.withMessage(400, 'MSG-13', { allowed_formats: 'PDF, PNG, JPG' }, 'file');
      });

      await assert.rejects(UploadService.confirmFile(createPendingFile()), isAppError(400, 'MSG-13', messages.SHEET_FORMATS, 'file'));
      assert.deepEqual(deleteMock.mock.calls.map((call) => call.arguments), [['f1']]);
      assert.deepEqual(deleteQuietlyMock.mock.calls.map((call) => call.arguments), [['sheet/2026-11/f1.pdf']]);
      assert.equal(markReadyMock.mock.callCount(), 0);
    });

    it('ném lại lỗi khi đánh dấu READY thất bại và dọn file để không còn file xác nhận dở', async () => {
      const { deleteMock, deleteQuietlyMock } = mockConfirmFlow(async () => inspectedSheet, async () => {
        throw new Error('DB down');
      });

      await assert.rejects(UploadService.confirmFile(createPendingFile()), /DB down/);
      assert.equal(deleteMock.mock.callCount(), 1);
      assert.equal(deleteQuietlyMock.mock.callCount(), 1);
    });

    it('xác nhận bản thu WAV và trả về DTO kèm URL công khai', async () => {
      mockFindFile(createAudioFile({ status: 'PENDING' }));
      mockConfirmFlow(
        async () => ({ sizeBytes: 96044, durationSec: 6, pageCount: null }),
        async (id, inspected) => createAudioFile({ id, ...inspected, status: 'READY' })
      );

      const result = await UploadService.confirmUpload('GV-A', 'a1');

      assert.deepEqual(result, {
        id: 'a1',
        name: 'ban-thu.wav',
        mimeType: 'audio/wav',
        sizeBytes: 96044,
        durationSec: 6,
        pageCount: null,
        url: 'http://localhost:3000/uploads/audio/2026-11/a1.wav'
      });
    });
  });

  describe('trimAudioByPitch', () => {
    it('chỉ cắt file audio: file SHEET giữ nguyên, không đọc storage', async () => {
      const { trimMock, putMock } = mockTrimFlow(null);

      const result = await UploadService.trimAudioByPitch(createMediaFile(), firstInspection as any);

      assert.equal(result, firstInspection);
      assert.equal(trimMock.mock.callCount(), 0);
      assert.equal(putMock.mock.callCount(), 0);
    });

    it('không có đoạn cần cắt thì giữ nguyên bản gốc', async () => {
      const { putMock } = mockTrimFlow(null);

      const result = await UploadService.trimAudioByPitch(createAudioFile(), firstInspection as any);

      assert.equal(result, firstInspection);
      assert.equal(putMock.mock.callCount(), 0);
    });

    it('cắt được thì ghi đè file và kiểm tra lại thông tin file', async () => {
      const { putMock } = mockTrimFlow(Buffer.from('trimmed'));

      const result = await UploadService.trimAudioByPitch(createAudioFile(), firstInspection as any);

      assert.deepEqual(result, { sizeBytes: 500, durationSec: 4, pageCount: null });
      assert.equal(putMock.mock.callCount(), 1);
      assert.equal(putMock.mock.calls[0].arguments[0], 'audio/2026-11/a1.wav');
      assert.equal(String(putMock.mock.calls[0].arguments[1]), 'trimmed');
    });

    it('ghi file đã cắt thất bại thì khôi phục bản gốc và không chặn việc tải lên', async () => {
      let attempts = 0;
      const { putMock } = mockTrimFlow(Buffer.from('trimmed'), async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('disk full');
      });

      const result = await UploadService.trimAudioByPitch(createAudioFile(), firstInspection as any);

      assert.equal(result, firstInspection);
      assert.equal(putMock.mock.callCount(), 2);
      assert.equal(String(putMock.mock.calls[1].arguments[1]), 'original');
    });
  });

  describe('requireAttachableFile', () => {
    it('báo lỗi 400 MSG-08 khi loại file không đúng với ô đã chọn', async () => {
      mockFindFile(createAudioFile({ id: 'f1' }));

      await assert.rejects(
        UploadService.requireAttachableFile('f1', 'GV-A', 'SHEET', 'sheetFileId'),
        isAppError(400, 'MSG-08', messages.FILE_KIND, 'sheetFileId')
      );
    });

    it('báo lỗi 409 MSG-08 khi file đã được dùng ở nơi khác', async () => {
      mockFindFile(createMediaFile());
      mock.method(MediaFileRepository, 'countUsages', async () => 1);

      await assert.rejects(UploadService.requireAttachableFile('f1', 'GV-A', 'SHEET', 'fileId'), isAppError(409, 'MSG-08', messages.FILE_USED, 'fileId'));
    });

    it('file READY chưa được dùng thì gắn ngay, không kiểm tra lại', async () => {
      mockFindFile(createMediaFile());
      mock.method(MediaFileRepository, 'countUsages', async () => 0);
      const { inspectMock } = mockConfirmFlow(async () => ({}));

      const result = await UploadService.requireAttachableFile('f1', 'GV-A', 'SHEET', 'fileId');

      assert.equal(result.status, 'READY');
      assert.equal(inspectMock.mock.callCount(), 0);
    });

    it('file PENDING được xác nhận ngầm khi gắn', async () => {
      mockFindFile(createPendingFile());
      mock.method(MediaFileRepository, 'countUsages', async () => 0);
      const { inspectMock, markReadyMock } = mockConfirmFlow(async () => inspectedSheet);

      const result = await UploadService.requireAttachableFile('f1', 'GV-A', 'SHEET', 'sheetFileId');

      assert.equal(result.status, 'READY');
      assert.equal(inspectMock.mock.callCount(), 1);
      assert.equal(markReadyMock.mock.callCount(), 1);
    });
  });

  describe('discardFile', () => {
    it('giá trị biên: không có file thì không xóa gì', async () => {
      const deleteMock = mock.method(MediaFileRepository, 'deleteById', async () => undefined as any);

      await UploadService.discardFile(null);

      assert.equal(deleteMock.mock.callCount(), 0);
    });

    it('KHÔNG xóa khi file vẫn đang được dùng', async () => {
      mock.method(MediaFileRepository, 'countUsages', async () => 1);
      const deleteMock = mock.method(MediaFileRepository, 'deleteById', async () => undefined as any);
      const deleteQuietlyMock = mock.method(StorageService, 'deleteQuietly', async () => undefined);

      await UploadService.discardFile(createMediaFile());

      assert.equal(deleteMock.mock.callCount(), 0);
      assert.equal(deleteQuietlyMock.mock.callCount(), 0);
    });

    it('xóa bản ghi và file trên storage khi không còn nơi nào dùng', async () => {
      mock.method(MediaFileRepository, 'countUsages', async () => 0);
      const deleteMock = mock.method(MediaFileRepository, 'deleteById', async () => undefined as any);
      const deleteQuietlyMock = mock.method(StorageService, 'deleteQuietly', async () => undefined);

      await UploadService.discardFile(createMediaFile());

      assert.deepEqual(deleteMock.mock.calls.map((call) => call.arguments), [['f1']]);
      assert.deepEqual(deleteQuietlyMock.mock.calls.map((call) => call.arguments), [['sheet/2026-11/f1.pdf']]);
    });
  });
});
