/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SavedItemRepository from '../repository/SavedItemRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import LibraryService from './LibraryService.ts';
import StudentClassService from './StudentClassService.ts';

const PIECE_NOT_PUBLIC = 'Không thể mở bài hát vì bài hát không còn công khai.';
const SHEET_NOT_PUBLIC = 'Không thể mở bản nhạc vì bản nhạc không còn công khai.';
const createdAt = new Date('2026-11-01T03:00:00.000Z');
const genre = { id: 'g-nambo', name: 'Dân ca Nam Bộ', status: 'ACTIVE', displayOrder: 0 };
const levelBasic = { id: 'l-coban', name: 'Cơ bản', status: 'ACTIVE', displayOrder: 0 };
const levelAdvanced = { id: 'l-nangcao', name: 'Nâng cao', status: 'ACTIVE', displayOrder: 2 };
const student = { userId: 'SV-1', role: 1 } as any;
const originalResolver = StudentClassService.activeInstrumentResolver;

function createInstrument(id = 'i-tranh', name = 'Đàn tranh'): any {
  return { id, code: id === 'i-tranh' ? 'DAN_TRANH' : 'DAN_BAU', name, isActive: true, fminHz: 80, fmaxHz: 2000, toleranceCents: 30 };
}

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

function createLibraryPiece(id: string, title: string): any {
  return { id, title, composer: 'Dân gian', description: `Mô tả ${title}`, createdAt, updatedAt: createdAt, coverFile: null, genre };
}

function createMainSheet(overrides: Record<string, unknown> = {}): any {
  return {
    id: 's1',
    pieceId: 'p1',
    instrumentId: 'i-tranh',
    kind: 'MAIN',
    name: 'Bản chính',
    description: null,
    durationSec: 6,
    visibility: 'PUBLIC',
    moderation: 'NORMAL',
    analysisStatus: 'NONE',
    analysisFileUrl: null,
    analysisError: null,
    analysisJobId: null,
    timeSignatureMissing: false,
    uploaderId: 'GV-A',
    createdAt,
    updatedAt: createdAt,
    instrument: createInstrument(),
    level: levelBasic,
    sheetFile: createMediaFile(),
    referenceAudio: createAudioFile(),
    tutorialVideo: null,
    piece: { id: 'p1', ownerId: 'GV-A', title: 'Lý ngựa ô', visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null, coverFile: null },
    ...overrides
  };
}

function createLevelSheet(overrides: Record<string, unknown> = {}): any {
  return createMainSheet({ id: 's2', kind: 'LEVEL', name: 'Bản dễ', durationSec: null, referenceAudio: null, uploaderId: 'GV-B', ...overrides });
}

function createQuery(overrides: Record<string, unknown> = {}): any {
  return { q: undefined, genreIds: [], instrumentIds: [], levelIds: [], sort: 'newest', page: 1, pageSize: 12, ...overrides };
}

function mockSavedIds(ids: string[]) {
  return mock.method(SavedItemRepository, 'findSavedTargetIds', async () => new Set(ids));
}

function mockClassInstrument(instrumentId: string | null) {
  const resolver = mock.fn(async (_studentId: string): Promise<string | null> => instrumentId);
  StudentClassService.activeInstrumentResolver = resolver;
  return resolver;
}

function mockLibraryList(pieces: unknown[], total: number) {
  const listMock = mock.method(PieceRepository, 'listLibrary', async () => [pieces, total] as any);
  mock.method(PieceRepository, 'findVisibleInstrumentPairs', async () => [
    { pieceId: 'p1', instrumentId: 'i-tranh' },
    { pieceId: 'p1', instrumentId: 'i-sao' },
    { pieceId: 'p2', instrumentId: 'i-tranh' }
  ]);
  const savedMock = mockSavedIds(['p2']);
  return { listMock, savedMock };
}

function mockTrending(counts: unknown[], visiblePieces: unknown[]) {
  const countsMock = mock.method(PieceRepository, 'findTrendingCounts', async () => counts as any);
  mock.method(PieceRepository, 'findVisibleByIds', async () => visiblePieces as any);
  mock.method(PieceRepository, 'findVisibleInstrumentPairs', async () => [
    { pieceId: 'p1', instrumentId: 'i-tranh' },
    { pieceId: 'p2', instrumentId: 'i-tranh' }
  ]);
  mockSavedIds([]);
  return countsMock;
}

function mockPieceDetail(sheets: unknown[], savedIds: string[] = []) {
  mock.method(PieceRepository, 'findVisibleById', async () => createLibraryPiece('p1', 'Lý ngựa ô'));
  mock.method(SheetMusicRepository, 'listVisibleByPiece', async () => sheets as any);
  mockSavedIds(savedIds);
}

function isAppError(statusCode: number, code: string, message: string) {
  return (err: unknown) => err instanceof AppError && err.statusCode === statusCode && err.code === code && err.message === message;
}

describe('LibraryService (Thư viện bài hát cho học sinh)', () => {
  afterEach(() => {
    StudentClassService.activeInstrumentResolver = originalResolver;
    mock.restoreAll();
  });

  describe('getStudentId / findSavedIds / hasActiveFilters', () => {
    it('lấy userId của học sinh đang xem', () => {
      assert.equal(LibraryService.getStudentId(student), 'SV-1');
    });

    it('trả về tập id đã lưu của học sinh', async () => {
      const savedMock = mockSavedIds(['p2']);

      const result = await LibraryService.findSavedIds(student, 'PIECE', ['p1', 'p2']);

      assert.deepEqual([...result], ['p2']);
      assert.deepEqual(savedMock.mock.calls[0].arguments, ['SV-1', 'PIECE', ['p1', 'p2']]);
    });

    it('nhận diện có bộ lọc khi có từ khóa tìm kiếm', () => {
      assert.equal(LibraryService.hasActiveFilters(createQuery({ q: 'ly ngua o' })), true);
    });
  });

  describe('buildEmptyState', () => {
    it('thư viện trống và không có bộ lọc: MSG-06', async () => {
      assert.deepEqual(await LibraryService.buildEmptyState(createQuery(), 0), { code: 'MSG-06', message: 'Thư viện chưa có bài hát.' });
    });

    it('có bộ lọc nhưng không có kết quả: MSG-07', async () => {
      mock.method(PieceRepository, 'countLibrary', async () => 3);

      assert.deepEqual(await LibraryService.buildEmptyState(createQuery({ q: 'abc' }), 0), { code: 'MSG-07', message: 'Không tìm thấy bài hát phù hợp.' });
    });
  });

  describe('listPieces', () => {
    it('liệt kê bài hát kèm số nhạc cụ và trạng thái đã lưu', async () => {
      const { listMock } = mockLibraryList([createLibraryPiece('p1', 'Lý ngựa ô'), createLibraryPiece('p2', 'Trống cơm')], 2);

      const result: any = await LibraryService.listPieces(student, createQuery());

      assert.deepEqual(result.items.map((item: any) => [item.id, item.instrumentCount, item.isSaved]), [['p1', 2, false], ['p2', 1, true]]);
      assert.equal(result.total, 2);
      assert.equal(result.totalPages, 1);
      assert.equal(result.emptyState, null);
      assert.equal(listMock.mock.callCount(), 1);
    });

    it('khách tìm không có kết quả: emptyState MSG-07 và KHÔNG đọc danh sách đã lưu', async () => {
      const { savedMock } = mockLibraryList([], 0);
      mock.method(PieceRepository, 'countLibrary', async () => 3);

      const result: any = await LibraryService.listPieces(undefined, createQuery({ q: 'zzz' }));

      assert.equal(result.emptyState.code, 'MSG-07');
      assert.equal(savedMock.mock.callCount(), 0);
    });
  });

  describe('listTrendingPieces', () => {
    it('xếp hạng bài hát theo lượt nộp trong tuần và bỏ bài không còn công khai', async () => {
      const countsMock = mockTrending(
        [{ pieceId: 'p2', submissionCount: 3 }, { pieceId: 'p-hidden', submissionCount: 2 }, { pieceId: 'p1', submissionCount: 1 }],
        [createLibraryPiece('p1', 'Lý ngựa ô'), createLibraryPiece('p2', 'Trống cơm')]
      );

      const result: any = await LibraryService.listTrendingPieces(student, new Date('2026-11-04T03:00:00Z'));

      const [since, limit] = countsMock.mock.calls[0].arguments as any[];
      assert.equal(result.weekStart, '2026-11-02');
      assert.deepEqual(result.items.map((item: any) => [item.id, item.weeklySubmissionCount]), [['p2', 3], ['p1', 1]]);
      assert.equal(result.items[0].description, 'Mô tả Trống cơm');
      assert.equal(since.toISOString(), '2026-11-01T17:00:00.000Z');
      assert.equal(limit, 5);
    });

    it('giá trị biên: đúng 00:00 thứ Hai (UTC+7) vẫn tính là đầu tuần hiện tại', async () => {
      const countsMock = mockTrending([], []);

      const result: any = await LibraryService.listTrendingPieces(undefined, new Date('2026-11-01T17:00:00Z'));

      assert.equal(result.weekStart, '2026-11-02');
      assert.equal((countsMock.mock.calls[0].arguments[0] as any).toISOString(), '2026-11-01T17:00:00.000Z');
    });
  });

  describe('resolveDefaultInstrumentId', () => {
    it('học sinh mặc định mở tab nhạc cụ của lớp đang học (R-07)', async () => {
      const resolver = mockClassInstrument('i-sao');

      const result = await LibraryService.resolveDefaultInstrumentId(student, ['i-tranh', 'i-sao']);

      assert.equal(result, 'i-sao');
      assert.deepEqual(resolver.mock.calls.map((call) => call.arguments), [['SV-1']]);
    });

    it('khách mặc định mở tab đầu tiên và KHÔNG tra cứu lớp học', async () => {
      const resolver = mockClassInstrument('i-sao');

      const result = await LibraryService.resolveDefaultInstrumentId(undefined, ['i-tranh', 'i-sao']);

      assert.equal(result, 'i-tranh');
      assert.equal(resolver.mock.callCount(), 0);
    });
  });

  describe('buildMainCard', () => {
    it('giá trị biên: không có bản chính thì trả về null', async () => {
      assert.equal(await LibraryService.buildMainCard(undefined, new Set()), null);
    });
  });

  describe('getPieceDetail', () => {
    it('khách xem chi tiết: một tab Đàn tranh gồm bản chính và bản nâng cao', async () => {
      mockPieceDetail([createMainSheet(), createLevelSheet({ name: 'Nâng cao', level: levelAdvanced })]);

      const detail: any = await LibraryService.getPieceDetail(undefined, 'p1');

      assert.equal(detail.instrumentCount, 1);
      assert.equal(detail.isSaved, false);
      assert.equal(detail.canPracticeEnsemble, false);
      assert.equal(detail.defaultInstrumentId, 'i-tranh');
      assert.equal(detail.tabs[0].sheetMusicCount, 2);
      assert.equal(detail.tabs[0].main.id, 's1');
      assert.deepEqual(detail.tabs[0].others.map((other: any) => other.name), ['Nâng cao']);
    });

    it('giá trị biên: tab chỉ có bản LEVEL thì main = null và chưa thể hòa tấu', async () => {
      mockPieceDetail([createMainSheet(), createLevelSheet({ id: 's-bau2', instrumentId: 'i-bau', instrument: createInstrument('i-bau', 'Đàn bầu') })]);

      const detail: any = await LibraryService.getPieceDetail(undefined, 'p1');

      assert.equal(detail.instrumentCount, 2);
      assert.equal(detail.canPracticeEnsemble, false);
      assert.equal(detail.tabs[1].main, null);
    });

    it('học sinh xem chi tiết: đánh dấu đã lưu và mặc định mở tab nhạc cụ của lớp', async () => {
      const bauMain = createMainSheet({
        id: 's-bau', instrumentId: 'i-bau', instrument: createInstrument('i-bau', 'Đàn bầu'), referenceAudio: createAudioFile({ id: 'a-bau' })
      });
      mockPieceDetail([createMainSheet(), bauMain], ['p1', 's-bau']);
      mockClassInstrument('i-bau');

      const detail: any = await LibraryService.getPieceDetail(student, 'p1');

      assert.equal(detail.isSaved, true);
      assert.equal(detail.defaultInstrumentId, 'i-bau');
      assert.equal(detail.tabs[1].main.isSaved, true);
    });

    it('báo lỗi 404 MSG-08 và KHÔNG đọc bản nhạc khi bài hát không còn công khai', async () => {
      mock.method(PieceRepository, 'findVisibleById', async () => null);
      const listSheetsMock = mock.method(SheetMusicRepository, 'listVisibleByPiece', async () => []);

      await assert.rejects(LibraryService.getPieceDetail(undefined, 'p1'), isAppError(404, 'MSG-08', PIECE_NOT_PUBLIC));
      assert.equal(listSheetsMock.mock.callCount(), 0);
    });
  });

  describe('findFallbackAudio / buildPracticeState', () => {
    it('bản LEVEL không có bản thu mẫu thì dùng bản thu của bản chính cùng nhạc cụ', async () => {
      const findMainMock = mock.method(SheetMusicRepository, 'findMain', async () => createMainSheet());

      const result: any = await LibraryService.findFallbackAudio(createLevelSheet());

      assert.equal(result.id, 'a1');
      assert.deepEqual(findMainMock.mock.calls[0].arguments, ['p1', 'i-tranh']);
    });

    it('bản LEVEL không cho luyện tập', () => {
      assert.deepEqual(LibraryService.buildPracticeState(createLevelSheet()), { isAvailable: false, reason: 'Hãy luyện bản chính của nhạc cụ này.' });
    });

    it('bản chính đã có file phân tích thì cho luyện tập', () => {
      assert.deepEqual(LibraryService.buildPracticeState(createMainSheet({ analysisFileUrl: 'http://rhythm/a.json' })), { isAvailable: true, reason: null });
    });
  });

  describe('getSheetMusicViewer', () => {
    it('bản LEVEL dùng bản thu mẫu dự phòng và mặc định mở tab REFERENCE_AUDIO', async () => {
      mock.method(SheetMusicRepository, 'findVisibleById', async () => createLevelSheet());
      mock.method(SheetMusicRepository, 'findMain', async () => createMainSheet());
      mockSavedIds([]);

      const view: any = await LibraryService.getSheetMusicViewer(undefined, 's2');

      assert.equal(view.sheetMusic.id, 's2');
      assert.equal(view.sheetFile.pageCount, 3);
      assert.equal(view.referenceAudio.isFallback, true);
      assert.equal(view.referenceAudio.durationSec, 6);
      assert.equal(view.tutorialVideo, null);
      assert.equal(view.defaultMediaTab, 'REFERENCE_AUDIO');
      assert.equal(view.practice.isAvailable, false);
    });

    it('bản chính có video hướng dẫn thì mặc định mở tab TUTORIAL_VIDEO và cho luyện tập', async () => {
      mock.method(SheetMusicRepository, 'findVisibleById', async () => createMainSheet({
        analysisFileUrl: 'http://rhythm/a.json',
        tutorialVideo: createMediaFile({ id: 'v1', kind: 'VIDEO', storageKey: 'video/2026-11/v1.mp4', mimeType: 'video/mp4', durationSec: 90 })
      }));
      mockSavedIds(['s1']);

      const view: any = await LibraryService.getSheetMusicViewer(student, 's1');

      assert.equal(view.sheetMusic.isSaved, true);
      assert.equal(view.referenceAudio.isFallback, false);
      assert.equal(view.defaultMediaTab, 'TUTORIAL_VIDEO');
      assert.equal(view.practice.isAvailable, true);
      assert.match(view.tutorialVideo.url, /\/uploads\/video\//);
    });

    it('báo lỗi 404 MSG-08 khi bản nhạc hoặc bài hát không còn công khai', async () => {
      mock.method(SheetMusicRepository, 'findVisibleById', async () => null);

      await assert.rejects(LibraryService.getSheetMusicViewer(undefined, 's1'), isAppError(404, 'MSG-08', SHEET_NOT_PUBLIC));
    });
  });
});
