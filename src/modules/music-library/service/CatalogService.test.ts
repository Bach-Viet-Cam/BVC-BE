/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import CatalogRepository from '../repository/CatalogRepository.ts';
import CatalogService from './CatalogService.ts';

const CATEGORY_INACTIVE = 'Không thể lưu vì danh mục đã chọn không còn hoạt động.';

function createCategory(id: string, name: string, displayOrder = 0, status = 'ACTIVE'): any {
  return { id, name, status, displayOrder };
}

function createInstrument(id = 'i-tranh', name = 'Đàn tranh', overrides: Record<string, unknown> = {}): any {
  return { id, code: 'DAN_TRANH', name, isActive: true, fminHz: 80, fmaxHz: 2000, toleranceCents: 30, ...overrides };
}

// Trả về các cấu hình có trong values, giống findConfigValues(keys)
function mockConfigValues(values: Record<string, string>) {
  return mock.method(CatalogRepository, 'findConfigValues', async (keys: string[]) =>
    keys.filter((key) => key in values).map((key) => ({ key, value: values[key] })) as any
  );
}

function isAppError(statusCode: number, code: string, message: string, field?: string) {
  return (err: unknown) =>
    err instanceof AppError && err.statusCode === statusCode && err.code === code && err.message === message && err.field === field;
}

describe('CatalogService (Danh mục, nhạc cụ & cấu hình upload)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('readConfigNumber', () => {
    it('trả về giá trị mặc định khi chưa có cấu hình', async () => {
      const configMock = mockConfigValues({});

      const result = await CatalogService.readConfigNumber('upload.sheet.max_mb', 10);

      assert.equal(result, 10);
      assert.equal(configMock.mock.callCount(), 1);
      assert.deepEqual(configMock.mock.calls[0].arguments, [['upload.sheet.max_mb']]);
    });

    it('trả về giá trị đã cấu hình', async () => {
      mockConfigValues({ 'upload.sheet.max_mb': '15' });

      assert.equal(await CatalogService.readConfigNumber('upload.sheet.max_mb', 10), 15);
    });

    it('giá trị biên: cấu hình bằng 0 thì dùng giá trị mặc định', async () => {
      mockConfigValues({ 'upload.sheet.max_mb': '0' });

      assert.equal(await CatalogService.readConfigNumber('upload.sheet.max_mb', 10), 10);
    });
  });

  describe('getFileRules', () => {
    it('quy tắc file SHEET mặc định: PDF, PNG, JPG tối đa 10 MB', async () => {
      mockConfigValues({});

      assert.deepEqual(await CatalogService.getFileRules('SHEET'), {
        extensions: ['pdf', 'png', 'jpg', 'jpeg'],
        formatLabel: 'PDF, PNG, JPG',
        maxMb: 10,
        maxBytes: 10485760
      });
    });

    it('quy tắc file AUDIO dùng dung lượng đã cấu hình 25 MB', async () => {
      mockConfigValues({ 'upload.audio.max_mb': '25' });

      const rules = await CatalogService.getFileRules('AUDIO');

      assert.equal(rules.maxMb, 25);
      assert.equal(rules.maxBytes, 26214400);
      assert.equal(rules.formatLabel, 'MP3, WAV, M4A');
    });

    it('quy tắc file VIDEO mặc định: MP4 tối đa 200 MB', async () => {
      mockConfigValues({});

      const rules = await CatalogService.getFileRules('VIDEO');

      assert.deepEqual(rules.extensions, ['mp4']);
      assert.equal(rules.maxMb, 200);
      assert.equal(rules.maxBytes, 209715200);
    });
  });

  describe('getAudioDurationRange', () => {
    it('trả về khoảng thời lượng mặc định 1 – 600 giây', async () => {
      mockConfigValues({});

      assert.deepEqual(await CatalogService.getAudioDurationRange(), { minSec: 1, maxSec: 600 });
    });
  });

  describe('getLibraryFilters', () => {
    it('trả về thể loại, trình độ và nhạc cụ đang hoạt động (chỉ id + name)', async () => {
      mock.method(CatalogRepository, 'listActiveCategories', async (type: string) =>
        (type === 'GENRE'
          ? [createCategory('g-nambo', 'Dân ca Nam Bộ')]
          : [createCategory('l-coban', 'Cơ bản'), createCategory('l-nangcao', 'Nâng cao', 2)]) as any
      );
      mock.method(CatalogRepository, 'listActiveInstruments', async () => [createInstrument(), createInstrument('i-sao', 'Sáo trúc')] as any);

      const filters = await CatalogService.getLibraryFilters();

      assert.deepEqual(filters.genres, [{ id: 'g-nambo', name: 'Dân ca Nam Bộ' }]);
      assert.equal(filters.levels.length, 2);
      assert.deepEqual(filters.instruments, [{ id: 'i-tranh', name: 'Đàn tranh' }, { id: 'i-sao', name: 'Sáo trúc' }]);
    });
  });

  describe('assertCategory', () => {
    it('chấp nhận danh mục đang hoạt động', async () => {
      const findMock = mock.method(CatalogRepository, 'findCategoriesByIds', async () => [createCategory('g-nambo', 'Dân ca Nam Bộ')] as any);

      await CatalogService.assertCategory('GENRE', 'g-nambo', 'genreId');

      assert.deepEqual(findMock.mock.calls[0].arguments, ['GENRE', ['g-nambo']]);
    });

    it('báo lỗi 400 MSG-35 khi danh mục không tồn tại', async () => {
      mock.method(CatalogRepository, 'findCategoriesByIds', async () => []);

      await assert.rejects(
        CatalogService.assertCategory('GENRE', 'g-x', 'genreId'),
        isAppError(400, 'MSG-35', 'Thể loại không được để trống.', 'genreId')
      );
    });

    it('báo lỗi 400 MSG-08 khi danh mục đã ngưng hoạt động', async () => {
      mock.method(CatalogRepository, 'findCategoriesByIds', async () => [createCategory('g-tutu', 'Nhạc tài tử', 2, 'INACTIVE')] as any);

      await assert.rejects(
        CatalogService.assertCategory('GENRE', 'g-tutu', 'genreId'),
        isAppError(400, 'MSG-08', CATEGORY_INACTIVE, 'genreId')
      );
    });
  });

  describe('assertInstrument', () => {
    it('chấp nhận nhạc cụ đang hoạt động', async () => {
      mock.method(CatalogRepository, 'findInstrumentsByIds', async () => [createInstrument()] as any);

      await assert.doesNotReject(CatalogService.assertInstrument('i-tranh'));
    });

    it('báo lỗi 400 MSG-35 khi nhạc cụ không tồn tại', async () => {
      mock.method(CatalogRepository, 'findInstrumentsByIds', async () => []);

      await assert.rejects(
        CatalogService.assertInstrument('i-x'),
        isAppError(400, 'MSG-35', 'Nhạc cụ không được để trống.', 'instrumentId')
      );
    });

    it('báo lỗi 400 MSG-08 khi nhạc cụ đã ngưng hoạt động', async () => {
      mock.method(CatalogRepository, 'findInstrumentsByIds', async () => [createInstrument('i-bau', 'Đàn bầu', { isActive: false })] as any);

      await assert.rejects(
        CatalogService.assertInstrument('i-bau'),
        isAppError(400, 'MSG-08', CATEGORY_INACTIVE, 'instrumentId')
      );
    });

    it('giá trị biên: giữ nguyên nhạc cụ cũ đã ngưng hoạt động thì không báo lỗi', async () => {
      mock.method(CatalogRepository, 'findInstrumentsByIds', async () => [createInstrument('i-bau', 'Đàn bầu', { isActive: false })] as any);

      await assert.doesNotReject(CatalogService.assertInstrument('i-bau', 'i-bau'));
    });
  });
});
