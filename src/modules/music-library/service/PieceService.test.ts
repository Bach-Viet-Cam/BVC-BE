/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import CatalogRepository from '../repository/CatalogRepository.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import PieceService from './PieceService.ts';
import UploadService from './UploadService.ts';

const messages = {
  PIECE_NOT_FOUND: 'Không thể tìm bài hát vì bài hát không tồn tại.',
  PIECE_NOT_OWNER: 'Không thể sửa bài hát vì chỉ chủ bài mới sửa được.',
  PIECE_ADMIN_HIDDEN: 'Không thể thay đổi hiển thị vì admin đã ẩn bài này, bạn không tự bật lại được.',
  CATEGORY_INACTIVE: 'Không thể lưu vì danh mục đã chọn không còn hoạt động.',
  FILE_KIND: 'Không thể gắn file vì loại file không đúng với ô đã chọn.',
  MSG46: 'Bài hát chưa có bản nhạc công khai nào; học sinh sẽ chưa thấy bản nhạc cho đến khi có bản công khai đầu tiên.'
};

const createdAt = new Date('2026-11-01T03:00:00.000Z');
const genre = { id: 'g-nambo', name: 'Dân ca Nam Bộ', status: 'ACTIVE', displayOrder: 0 };
const inactiveGenre = { id: 'g-tutu', name: 'Nhạc tài tử', status: 'INACTIVE', displayOrder: 2 };
const instrument = { id: 'i-tranh', code: 'DAN_TRANH', name: 'Đàn tranh', isActive: true, fminHz: 80, fmaxHz: 2000, toleranceCents: 30 };
const pieceInput = { title: 'Lý ngựa ô (bản mới)', genreId: 'g-nambo' };
const lecturerQuery = { q: undefined, visibility: 'ALL', page: 1, pageSize: 20 } as any;

function createMockPiece(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'p1',
    ownerId: 'GV-A',
    title: 'Lý ngựa ô',
    composer: 'Dân gian',
    description: 'Dân ca Nam Bộ',
    visibility: 'HIDDEN',
    moderation: 'NORMAL',
    moderationReason: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
    coverFile: null,
    genre,
    sheetMusic: [],
    ...overrides
  };
}

function createCoverFile(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'c-old', kind: 'COVER', status: 'READY', storageKey: 'cover/2026-11/c-old.png', originalName: 'bia.png', mimeType: 'image/png',
    sizeBytes: 1000, durationSec: null, pageCount: null, uploadedById: 'GV-A', createdAt: new Date(), ...overrides
  };
}

function mockFindPiece(record: unknown) {
  return mock.method(PieceRepository, 'findById', async () => record as any);
}

function mockVisibleSheetCount(count: number) {
  return mock.method(SheetMusicRepository, 'countVisibleByPiece', async () => count);
}

function isAppError(statusCode: number, code: string, message: string, field?: string) {
  return (err: unknown) =>
    err instanceof AppError && err.statusCode === statusCode && err.code === code && err.message === message && err.field === field;
}

function mockCreateFlow(genreRow: unknown = genre) {
  mock.method(CatalogRepository, 'findCategoriesByIds', async () => (genreRow ? [genreRow] : []) as any);
  const createMock = mock.method(PieceRepository, 'create', async (ownerId: string, data: Record<string, unknown>) =>
    createMockPiece({ ownerId, ...data, coverFile: data.coverFileId ? createCoverFile({ id: String(data.coverFileId) }) : null })
  );
  mockVisibleSheetCount(0);
  const attachMock = mock.method(UploadService, 'requireAttachableFile', async (id: string) => createCoverFile({ id }));
  return { createMock, attachMock };
}

function mockUpdateFlow(record: unknown, genreRow: unknown = genre, visibleCount = 1) {
  mockFindPiece(record);
  mock.method(CatalogRepository, 'findCategoriesByIds', async () => [genreRow] as any);
  mockVisibleSheetCount(visibleCount);
  const updateMock = mock.method(PieceRepository, 'update', async (id: string, data: Record<string, unknown>) => createMockPiece({ id, ...data }));
  const attachMock = mock.method(UploadService, 'requireAttachableFile', async (id: string) => createCoverFile({ id }));
  const discardMock = mock.method(UploadService, 'discardFile', async () => undefined);
  return { updateMock, attachMock, discardMock };
}

function mockVisibilityFlow(record: any, visibleCount = 1) {
  mockFindPiece(record);
  mockVisibleSheetCount(visibleCount);
  return mock.method(PieceRepository, 'updateFields', async (_id: string, data: Record<string, unknown>) => createMockPiece({ ...record, ...data }));
}

function mockCoverFlow(record: unknown) {
  mockFindPiece(record);
  const attachMock = mock.method(UploadService, 'requireAttachableFile', async (id: string) =>
    createCoverFile({ id, storageKey: `cover/2026-11/${id}.png` })
  );
  const updateFieldsMock = mock.method(PieceRepository, 'updateFields', async (_id: string, data: Record<string, unknown>) =>
    createMockPiece({
      coverFile: data.coverFileId ? createCoverFile({ id: String(data.coverFileId), storageKey: `cover/2026-11/${data.coverFileId}.png` }) : null
    })
  );
  const discardMock = mock.method(UploadService, 'discardFile', async () => undefined);
  return { attachMock, updateFieldsMock, discardMock };
}

describe('PieceService (Giảng viên quản lý bài hát)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('getActivePiece / getOwnedPiece', () => {
    it('trả về bài hát đang hoạt động', async () => {
      const findMock = mockFindPiece(createMockPiece());

      const result = await PieceService.getActivePiece('p1');

      assert.equal(result.id, 'p1');
      assert.deepEqual(findMock.mock.calls[0].arguments, ['p1']);
    });

    it('báo lỗi 404 MSG-08 khi bài hát không tồn tại hoặc đã xóa mềm', async () => {
      mockFindPiece(null);

      await assert.rejects(PieceService.getActivePiece('p-x'), isAppError(404, 'MSG-08', messages.PIECE_NOT_FOUND));
    });

    it('chủ bài hát lấy được bài của mình', async () => {
      mockFindPiece(createMockPiece());

      const result = await PieceService.getOwnedPiece('GV-A', 'p1');

      assert.equal(result.ownerId, 'GV-A');
    });

    it('báo lỗi 403 MSG-08 khi giảng viên không phải chủ bài', async () => {
      mockFindPiece(createMockPiece());

      await assert.rejects(PieceService.getOwnedPiece('GV-B', 'p1'), isAppError(403, 'MSG-08', messages.PIECE_NOT_OWNER));
    });
  });

  describe('listPieces', () => {
    it('liệt kê bài hát kèm số bản nhạc, số bản công khai và danh sách nhạc cụ', async () => {
      const sheetSummaries = [
        { id: 's1', instrumentId: 'i-tranh', visibility: 'PUBLIC', moderation: 'NORMAL', instrument },
        { id: 's2', instrumentId: 'i-tranh', visibility: 'HIDDEN', moderation: 'NORMAL', instrument }
      ];
      const listMock = mock.method(PieceRepository, 'listForLecturer', async () => [[createMockPiece({ sheetMusic: sheetSummaries })], 1] as any);

      const page: any = await PieceService.listPieces('GV-A', lecturerQuery);

      assert.equal(page.total, 1);
      assert.equal(page.totalPages, 1);
      assert.equal(page.items[0].canEdit, true);
      assert.equal(page.items[0].sheetMusicCount, 2);
      assert.equal(page.items[0].publicSheetMusicCount, 1);
      assert.deepEqual(page.items[0].instruments, [{ id: 'i-tranh', name: 'Đàn tranh' }]);
      assert.deepEqual(listMock.mock.calls[0].arguments, ['GV-A', lecturerQuery]);
    });

    it('giá trị biên: danh sách rỗng vẫn có totalPages = 1', async () => {
      mock.method(PieceRepository, 'listForLecturer', async () => [[], 0] as any);

      assert.deepEqual(await PieceService.listPieces('GV-A', lecturerQuery), { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
    });
  });

  describe('getPiece', () => {
    it('giảng viên khác xem được bài nhưng không có quyền sửa', async () => {
      mockFindPiece(createMockPiece());

      const dto: any = await PieceService.getPiece('GV-B', 'p1');

      assert.equal(dto.canEdit, false);
      assert.equal(dto.canChangeVisibility, false);
      assert.equal(dto.canManageSheets, false);
      assert.equal(dto.effectiveVisibility, 'HIDDEN');
    });

    it('bài bị admin ẩn: chủ bài vẫn sửa được nhưng không đổi được hiển thị', async () => {
      mockFindPiece(createMockPiece({ visibility: 'PUBLIC', moderation: 'ADMIN_HIDDEN', moderationReason: 'Vi phạm bản quyền' }));

      const dto: any = await PieceService.getPiece('GV-A', 'p1');

      assert.equal(dto.canEdit, true);
      assert.equal(dto.canChangeVisibility, false);
      assert.equal(dto.effectiveVisibility, 'ADMIN_HIDDEN');
      assert.equal(dto.moderationReason, 'Vi phạm bản quyền');
    });
  });

  describe('buildPublicWarning', () => {
    it('cảnh báo MSG-46 khi bài công khai nhưng chưa có bản nhạc công khai', async () => {
      const countMock = mockVisibleSheetCount(0);

      const warning = await PieceService.buildPublicWarning(createMockPiece({ visibility: 'PUBLIC' }));

      assert.deepEqual(warning, { code: 'MSG-46', message: messages.MSG46 });
      assert.deepEqual(countMock.mock.calls[0].arguments, ['p1']);
    });

    it('không cảnh báo khi đã có bản nhạc công khai', async () => {
      mockVisibleSheetCount(2);

      assert.equal(await PieceService.buildPublicWarning(createMockPiece({ visibility: 'PUBLIC' })), null);
    });

    it('không cảnh báo và không đếm bản nhạc khi bài đang ẩn', async () => {
      const countMock = mockVisibleSheetCount(0);

      assert.equal(await PieceService.buildPublicWarning(createMockPiece()), null);
      assert.equal(countMock.mock.callCount(), 0);
    });
  });

  describe('createPiece', () => {
    it('tạo bài hát mặc định ẩn, không có ảnh bìa', async () => {
      const { createMock, attachMock } = mockCreateFlow();

      const result: any = await PieceService.createPiece('GV-A', { title: 'Lý ngựa ô', genreId: 'g-nambo' } as any);

      assert.deepEqual(createMock.mock.calls[0].arguments, [
        'GV-A',
        { title: 'Lý ngựa ô', composer: null, description: null, genreId: 'g-nambo', visibility: 'HIDDEN', coverFileId: null }
      ]);
      assert.equal(result.piece.visibility, 'HIDDEN');
      assert.equal(result.warning, null);
      assert.equal(attachMock.mock.callCount(), 0);
    });

    it('tạo bài hát công khai khi chưa có bản nhạc thì kèm cảnh báo MSG-46', async () => {
      const { createMock } = mockCreateFlow();

      const result: any = await PieceService.createPiece('GV-A', { title: 'Trống cơm', genreId: 'g-nambo', visibility: 'PUBLIC' } as any);

      assert.equal((createMock.mock.calls[0].arguments[1] as any).visibility, 'PUBLIC');
      assert.equal(result.warning.code, 'MSG-46');
    });

    it('tạo bài hát kèm ảnh bìa đã tải lên', async () => {
      const { createMock, attachMock } = mockCreateFlow();

      const result: any = await PieceService.createPiece('GV-A', { title: 'Lý ngựa ô', genreId: 'g-nambo', coverFileId: 'c1' } as any);

      assert.deepEqual(attachMock.mock.calls[0].arguments, ['c1', 'GV-A', 'COVER', 'coverFileId']);
      assert.equal((createMock.mock.calls[0].arguments[1] as any).coverFileId, 'c1');
      assert.match(result.piece.coverUrl, /^http:\/\/localhost:3000\/uploads\/cover\//);
    });

    it('báo lỗi 400 MSG-08 và KHÔNG tạo bài khi thể loại đã ngưng hoạt động', async () => {
      const { createMock } = mockCreateFlow(inactiveGenre);

      await assert.rejects(
        PieceService.createPiece('GV-A', { title: 'Lý ngựa ô', genreId: 'g-tutu' } as any),
        isAppError(400, 'MSG-08', messages.CATEGORY_INACTIVE, 'genreId')
      );
      assert.equal(createMock.mock.callCount(), 0);
    });

    it('báo lỗi 400 MSG-35 và KHÔNG tạo bài khi thể loại không tồn tại', async () => {
      const { createMock } = mockCreateFlow(null);

      await assert.rejects(
        PieceService.createPiece('GV-A', { title: 'Lý ngựa ô', genreId: 'g-x' } as any),
        isAppError(400, 'MSG-35', 'Thể loại không được để trống.', 'genreId')
      );
      assert.equal(createMock.mock.callCount(), 0);
    });
  });

  describe('assertVisibilityChangeAllowed', () => {
    it('cho phép công khai bài đang ẩn bình thường', () => {
      assert.doesNotThrow(() => PieceService.assertVisibilityChangeAllowed(createMockPiece(), 'PUBLIC'));
    });

    it('không kiểm tra khi không yêu cầu đổi hiển thị', () => {
      assert.doesNotThrow(() => PieceService.assertVisibilityChangeAllowed(createMockPiece({ visibility: 'PUBLIC', moderation: 'ADMIN_HIDDEN' }), undefined));
    });

    it('báo lỗi 409 MSG-08 khi đổi hiển thị bài đã bị admin ẩn', () => {
      assert.throws(
        () => PieceService.assertVisibilityChangeAllowed(createMockPiece({ visibility: 'PUBLIC', moderation: 'ADMIN_HIDDEN' }), 'HIDDEN'),
        isAppError(409, 'MSG-08', messages.PIECE_ADMIN_HIDDEN, 'visibility')
      );
    });
  });

  describe('updatePiece', () => {
    it('cập nhật nội dung bài hát, không đụng tới hiển thị và ảnh bìa', async () => {
      const { updateMock, discardMock } = mockUpdateFlow(createMockPiece());

      const result: any = await PieceService.updatePiece('GV-A', 'p1', pieceInput as any);

      assert.deepEqual(updateMock.mock.calls[0].arguments, ['p1', { title: 'Lý ngựa ô (bản mới)', composer: null, description: null, genreId: 'g-nambo' }]);
      assert.equal(discardMock.mock.callCount(), 0);
      assert.equal(result.piece.title, 'Lý ngựa ô (bản mới)');
    });

    it('thay ảnh bìa mới và xóa ảnh bìa cũ', async () => {
      const { updateMock, attachMock, discardMock } = mockUpdateFlow(createMockPiece({ coverFile: createCoverFile() }));

      await PieceService.updatePiece('GV-A', 'p1', { ...pieceInput, coverFileId: 'c-new' } as any);

      assert.deepEqual(attachMock.mock.calls[0].arguments, ['c-new', 'GV-A', 'COVER', 'coverFileId']);
      assert.equal((updateMock.mock.calls[0].arguments[1] as any).coverFileId, 'c-new');
      assert.equal((discardMock.mock.calls[0].arguments[0] as any).id, 'c-old');
    });

    it('gỡ ảnh bìa (coverFileId = null) và xóa ảnh bìa cũ', async () => {
      const { updateMock, attachMock, discardMock } = mockUpdateFlow(createMockPiece({ coverFile: createCoverFile() }));

      await PieceService.updatePiece('GV-A', 'p1', { ...pieceInput, coverFileId: null } as any);

      assert.equal((updateMock.mock.calls[0].arguments[1] as any).coverFileId, null);
      assert.equal(attachMock.mock.callCount(), 0);
      assert.equal((discardMock.mock.calls[0].arguments[0] as any).id, 'c-old');
    });

    it('công khai bài khi chưa có bản nhạc công khai thì kèm cảnh báo MSG-46', async () => {
      const { updateMock } = mockUpdateFlow(createMockPiece(), genre, 0);

      const result: any = await PieceService.updatePiece('GV-A', 'p1', { ...pieceInput, visibility: 'PUBLIC' } as any);

      assert.equal((updateMock.mock.calls[0].arguments[1] as any).visibility, 'PUBLIC');
      assert.equal(result.warning.code, 'MSG-46');
    });

    it('báo lỗi 409 MSG-08 và KHÔNG cập nhật khi đổi hiển thị bài bị admin ẩn', async () => {
      const { updateMock } = mockUpdateFlow(createMockPiece({ visibility: 'PUBLIC', moderation: 'ADMIN_HIDDEN' }));

      await assert.rejects(
        PieceService.updatePiece('GV-A', 'p1', { ...pieceInput, visibility: 'HIDDEN' } as any),
        isAppError(409, 'MSG-08', messages.PIECE_ADMIN_HIDDEN, 'visibility')
      );
      assert.equal(updateMock.mock.callCount(), 0);
    });

    it('báo lỗi 400 MSG-08 và KHÔNG cập nhật khi chọn thể loại mới đã ngưng hoạt động', async () => {
      const { updateMock } = mockUpdateFlow(createMockPiece(), inactiveGenre);

      await assert.rejects(
        PieceService.updatePiece('GV-A', 'p1', { ...pieceInput, genreId: 'g-tutu' } as any),
        isAppError(400, 'MSG-08', messages.CATEGORY_INACTIVE, 'genreId')
      );
      assert.equal(updateMock.mock.callCount(), 0);
    });
  });

  describe('setVisibility', () => {
    it('công khai bài đã có bản nhạc công khai: không cảnh báo', async () => {
      const updateFieldsMock = mockVisibilityFlow(createMockPiece());

      const result: any = await PieceService.setVisibility('GV-A', 'p1', 'PUBLIC');

      assert.deepEqual(updateFieldsMock.mock.calls[0].arguments, ['p1', { visibility: 'PUBLIC' }]);
      assert.equal(result.warning, null);
    });

    it('công khai bài chưa có bản nhạc công khai: vẫn cho phép kèm cảnh báo MSG-46 (R-03)', async () => {
      mockVisibilityFlow(createMockPiece(), 0);

      const result: any = await PieceService.setVisibility('GV-A', 'p1', 'PUBLIC');

      assert.equal(result.warning.code, 'MSG-46');
    });

    it('ẩn bài đang công khai', async () => {
      const updateFieldsMock = mockVisibilityFlow(createMockPiece({ visibility: 'PUBLIC' }));

      const result: any = await PieceService.setVisibility('GV-A', 'p1', 'HIDDEN');

      assert.equal(result.piece.visibility, 'HIDDEN');
      assert.equal((updateFieldsMock.mock.calls[0].arguments[1] as any).visibility, 'HIDDEN');
    });

    it('báo lỗi 409 MSG-08 và KHÔNG cập nhật khi bài bị admin ẩn', async () => {
      const updateFieldsMock = mockVisibilityFlow(createMockPiece({ moderation: 'ADMIN_HIDDEN' }));

      await assert.rejects(PieceService.setVisibility('GV-A', 'p1', 'PUBLIC'), isAppError(409, 'MSG-08', messages.PIECE_ADMIN_HIDDEN, 'visibility'));
      assert.equal(updateFieldsMock.mock.callCount(), 0);
    });

    it('báo lỗi 403 MSG-08 và KHÔNG cập nhật khi không phải chủ bài', async () => {
      const updateFieldsMock = mockVisibilityFlow(createMockPiece());

      await assert.rejects(PieceService.setVisibility('GV-B', 'p1', 'PUBLIC'), isAppError(403, 'MSG-08', messages.PIECE_NOT_OWNER));
      assert.equal(updateFieldsMock.mock.callCount(), 0);
    });
  });

  describe('replaceCover / removeCover', () => {
    it('thay ảnh bìa: gắn file mới, cập nhật coverFileId và xóa ảnh cũ', async () => {
      const { attachMock, updateFieldsMock, discardMock } = mockCoverFlow(createMockPiece({ coverFile: createCoverFile() }));

      const dto: any = await PieceService.replaceCover('GV-A', 'p1', 'c-new');

      assert.deepEqual(attachMock.mock.calls[0].arguments, ['c-new', 'GV-A', 'COVER', 'fileId']);
      assert.deepEqual(updateFieldsMock.mock.calls.map((call) => call.arguments), [['p1', { coverFileId: 'c-new' }]]);
      assert.equal((discardMock.mock.calls[0].arguments[0] as any).id, 'c-old');
      assert.equal(dto.coverUrl, 'http://localhost:3000/uploads/cover/2026-11/c-new.png');
    });

    it('giá trị biên: bài chưa có ảnh bìa thì discardFile nhận null', async () => {
      const { discardMock } = mockCoverFlow(createMockPiece());

      await PieceService.replaceCover('GV-A', 'p1', 'c-new');

      assert.deepEqual(discardMock.mock.calls.map((call) => call.arguments), [[null]]);
    });

    it('báo lỗi 400 MSG-08 và KHÔNG cập nhật khi file không phải ảnh bìa', async () => {
      const { attachMock, updateFieldsMock, discardMock } = mockCoverFlow(createMockPiece());
      attachMock.mock.mockImplementation(async () => {
        throw AppError.withMessage(400, 'MSG-08', { action: 'gắn file', reason: 'loại file không đúng với ô đã chọn' }, 'fileId');
      });

      await assert.rejects(PieceService.replaceCover('GV-A', 'p1', 'a1'), isAppError(400, 'MSG-08', messages.FILE_KIND, 'fileId'));
      assert.equal(updateFieldsMock.mock.callCount(), 0);
      assert.equal(discardMock.mock.callCount(), 0);
    });

    it('gỡ ảnh bìa: coverFileId = null và xóa ảnh cũ', async () => {
      const { updateFieldsMock, discardMock } = mockCoverFlow(createMockPiece({ coverFile: createCoverFile() }));

      const dto: any = await PieceService.removeCover('GV-A', 'p1');

      assert.deepEqual(updateFieldsMock.mock.calls.map((call) => call.arguments), [['p1', { coverFileId: null }]]);
      assert.equal((discardMock.mock.calls[0].arguments[0] as any).id, 'c-old');
      assert.equal(dto.coverUrl, null);
    });

    it('báo lỗi 403 MSG-08 và KHÔNG xóa ảnh khi không phải chủ bài', async () => {
      const { discardMock } = mockCoverFlow(createMockPiece({ coverFile: createCoverFile() }));

      await assert.rejects(PieceService.removeCover('GV-B', 'p1'), isAppError(403, 'MSG-08', messages.PIECE_NOT_OWNER));
      assert.equal(discardMock.mock.callCount(), 0);
    });
  });
});
