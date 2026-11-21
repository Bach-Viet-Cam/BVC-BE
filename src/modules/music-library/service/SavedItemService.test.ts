/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SavedItemRepository from '../repository/SavedItemRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import SavedItemService from './SavedItemService.ts';

const PIECE_NOT_PUBLIC = 'Không thể mở bài hát vì bài hát không còn công khai.';
const createdAt = new Date('2026-11-01T03:00:00.000Z');
const genre = { id: 'g-nambo', name: 'Dân ca Nam Bộ', status: 'ACTIVE', displayOrder: 0 };
const instrument = { id: 'i-tranh', code: 'DAN_TRANH', name: 'Đàn tranh', isActive: true, fminHz: 80, fmaxHz: 2000, toleranceCents: 30 };

function createLibraryPiece(id: string, title: string): any {
  return { id, title, composer: 'Dân gian', description: `Mô tả ${title}`, createdAt, updatedAt: createdAt, coverFile: null, genre };
}

const savedPiece = {
  id: 'si1',
  targetType: 'PIECE',
  savedAt: new Date('2026-11-05T02:00:00Z'),
  piece: createLibraryPiece('p1', 'Lý ngựa ô'),
  sheetMusic: null
};

const savedSheet = {
  id: 'si2',
  targetType: 'SHEET_MUSIC',
  savedAt: new Date('2026-11-05T03:00:00Z'),
  piece: null,
  sheetMusic: {
    id: 's1',
    name: 'Bản chính',
    kind: 'MAIN',
    durationSec: 6,
    instrument,
    level: genre,
    piece: { id: 'p1', title: 'Lý ngựa ô', coverFile: null }
  }
};

function mockSavedList(items: unknown[], total: number, pieceCount: number, sheetCount: number) {
  mock.method(SavedItemRepository, 'countVisible', async (_studentId: string, type: string) => (type === 'PIECE' ? pieceCount : sheetCount));
  return mock.method(SavedItemRepository, 'listVisible', async () => [items, total] as any);
}

describe('SavedItemService (Lưu bài hát & bản nhạc)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('savePiece', () => {
    it('lưu bài hát công khai (idempotent nhờ skipDuplicates)', async () => {
      mock.method(PieceRepository, 'findVisibleById', async () => createLibraryPiece('p1', 'Lý ngựa ô'));
      const saveMock = mock.method(SavedItemRepository, 'save', async () => undefined as any);

      await SavedItemService.savePiece('SV-1', 'p1');

      assert.equal(saveMock.mock.callCount(), 1);
      assert.deepEqual(saveMock.mock.calls[0].arguments, ['SV-1', 'PIECE', 'p1']);
    });

    it('báo lỗi 404 MSG-08 và KHÔNG lưu khi bài hát không còn công khai', async () => {
      mock.method(PieceRepository, 'findVisibleById', async () => null);
      const saveMock = mock.method(SavedItemRepository, 'save', async () => undefined as any);

      await assert.rejects(
        SavedItemService.savePiece('SV-1', 'p1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 404 && err.code === 'MSG-08' && err.message === PIECE_NOT_PUBLIC
      );
      assert.equal(saveMock.mock.callCount(), 0);
    });
  });

  describe('saveSheetMusic', () => {
    it('lưu bản nhạc công khai', async () => {
      mock.method(SheetMusicRepository, 'findVisibleById', async () => ({ id: 's1' }) as any);
      const saveMock = mock.method(SavedItemRepository, 'save', async () => undefined as any);

      await SavedItemService.saveSheetMusic('SV-1', 's1');

      assert.deepEqual(saveMock.mock.calls[0].arguments, ['SV-1', 'SHEET_MUSIC', 's1']);
    });
  });

  describe('unsave', () => {
    it('bỏ lưu bài hát', async () => {
      const removeMock = mock.method(SavedItemRepository, 'remove', async () => undefined as any);

      await SavedItemService.unsave('SV-1', 'PIECE', 'p1');

      assert.equal(removeMock.mock.callCount(), 1);
      assert.deepEqual(removeMock.mock.calls[0].arguments, ['SV-1', 'PIECE', 'p1']);
    });

    it('giá trị biên: bỏ lưu mục chưa từng lưu thì không báo lỗi', async () => {
      mock.method(SavedItemRepository, 'remove', async () => undefined as any);

      await assert.doesNotReject(SavedItemService.unsave('SV-1', 'SHEET_MUSIC', 's-x'));
    });
  });

  describe('listSaved', () => {
    it('liệt kê bài hát đã lưu kèm số lượng theo từng loại', async () => {
      const listMock = mockSavedList([savedPiece], 1, 1, 2);
      const query = { type: 'PIECE', page: 1, pageSize: 20 } as any;

      const result: any = await SavedItemService.listSaved('SV-1', query);

      assert.equal(result.items[0].savedAt, '2026-11-05T02:00:00.000Z');
      assert.equal(result.items[0].piece.title, 'Lý ngựa ô');
      assert.equal(result.items[0].piece.genre.name, 'Dân ca Nam Bộ');
      assert.deepEqual(result.counts, { PIECE: 1, SHEET_MUSIC: 2 });
      assert.equal(result.emptyState, null);
      assert.deepEqual(listMock.mock.calls[0].arguments, ['SV-1', { type: 'PIECE', page: 1, pageSize: 20 }]);
    });

    it('liệt kê bản nhạc đã lưu kèm thông tin bài hát', async () => {
      mockSavedList([savedSheet], 1, 0, 1);

      const result: any = await SavedItemService.listSaved('SV-1', { type: 'SHEET_MUSIC', page: 1, pageSize: 20 } as any);

      assert.equal(result.items[0].sheetMusic.name, 'Bản chính');
      assert.equal(result.items[0].sheetMusic.isMain, true);
      assert.equal(result.items[0].piece.title, 'Lý ngựa ô');
      assert.deepEqual(result.counts, { PIECE: 0, SHEET_MUSIC: 1 });
    });

    it('giá trị biên: danh sách rỗng trả về emptyState MSG-06', async () => {
      mockSavedList([], 0, 2, 0);

      const result: any = await SavedItemService.listSaved('SV-1', { type: 'SHEET_MUSIC', page: 1, pageSize: 20 } as any);

      assert.deepEqual(result.emptyState, { code: 'MSG-06', message: 'Danh sách đã lưu chưa có bản nhạc.' });
      assert.deepEqual(result.counts, { PIECE: 2, SHEET_MUSIC: 0 });
    });
  });
});
