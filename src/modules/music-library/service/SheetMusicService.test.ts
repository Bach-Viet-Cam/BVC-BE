/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import CatalogRepository from '../repository/CatalogRepository.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import AnalysisService from './AnalysisService.ts';
import SheetMusicService from './SheetMusicService.ts';
import UploadService from './UploadService.ts';

const messages = {
  PIECE_NOT_FOUND: 'Không thể tìm bài hát vì bài hát không tồn tại.',
  SHEET_NOT_FOUND: 'Không thể tìm bản nhạc vì bản nhạc không tồn tại.',
  PIECE_LOCKED: 'Không thể thay đổi bản nhạc vì bài hát đang bị ẩn.',
  SHEET_ADMIN_HIDDEN: 'Không thể thay đổi hiển thị vì admin đã ẩn bản nhạc này, bạn không tự bật lại được.',
  NEEDS_AUDIO: 'Không thể công khai bản nhạc vì bản chính cần bản thu mẫu trước khi công khai.',
  MAIN_EXISTS: 'Không thể tạo bản chính vì nhạc cụ này đã có bản chính.',
  CATEGORY_INACTIVE: 'Không thể lưu vì danh mục đã chọn không còn hoạt động.',
  NAME_USED: 'Tên bản này đã được sử dụng.'
};

const createdAt = new Date('2026-11-01T03:00:00.000Z');
const genre = { id: 'g-nambo', name: 'Dân ca Nam Bộ', status: 'ACTIVE', displayOrder: 0 };
const levelBasic = { id: 'l-coban', name: 'Cơ bản', status: 'ACTIVE', displayOrder: 0 };
const levelAdvanced = { id: 'l-nangcao', name: 'Nâng cao', status: 'ACTIVE', displayOrder: 2 };
const sheetInput = { instrumentId: 'i-tranh', name: 'Bản chính', levelId: 'l-coban', sheetFileId: 'f1' };
const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

function createInstrument(id = 'i-tranh', name = 'Đàn tranh', overrides: Record<string, unknown> = {}): any {
  const code = id === 'i-tranh' ? 'DAN_TRANH' : id === 'i-bau' ? 'DAN_BAU' : 'SAO_TRUC';
  return { id, code, name, isActive: true, fminHz: 80, fmaxHz: 2000, toleranceCents: 30, ...overrides };
}

function createMediaFile(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'f1', kind: 'SHEET', status: 'READY', storageKey: 'sheet/2026-11/f1.pdf', originalName: 'ban-nhac.pdf', mimeType: 'application/pdf',
    sizeBytes: 1000, durationSec: null, pageCount: 3, uploadedById: 'GV-A', createdAt: new Date(), ...overrides
  };
}

function createAudioFile(overrides: Record<string, unknown> = {}): any {
  return createMediaFile({
    id: 'a1', kind: 'AUDIO', storageKey: 'audio/2026-11/a1.wav', originalName: 'ban-thu.wav', mimeType: 'audio/wav', durationSec: 6, pageCount: null, ...overrides
  });
}

function createMockPiece(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'p1', ownerId: 'GV-A', title: 'Lý ngựa ô', composer: 'Dân gian', description: 'Dân ca Nam Bộ', visibility: 'HIDDEN', moderation: 'NORMAL',
    moderationReason: null, deletedAt: null, createdAt, updatedAt: createdAt, coverFile: null, genre, sheetMusic: [], ...overrides
  };
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

// Bản LEVEL s2 do GV-B tải lên, thuộc bài p1 của GV-A
function createLevelSheet(overrides: Record<string, unknown> = {}): any {
  return createMainSheet({ id: 's2', kind: 'LEVEL', name: 'Bản dễ', durationSec: null, referenceAudio: null, uploaderId: 'GV-B', ...overrides });
}

function mockFindSheet(record: unknown) {
  return mock.method(SheetMusicRepository, 'findById', async () => record as any);
}

function isAppError(statusCode: number, code: string, message: string, field?: string) {
  return (err: unknown) =>
    err instanceof AppError && err.statusCode === statusCode && err.code === code && err.message === message && err.field === field;
}

interface CreateFlowOptions {
  main?: unknown;
  instrument?: unknown;
  level?: unknown;
  pieceVisibility?: string;
  findByName?: () => Promise<unknown>;
  create?: (data: any) => Promise<unknown>;
}

function mockCreateFlow(options: CreateFlowOptions = {}) {
  mock.method(PieceRepository, 'findById', async () => createMockPiece({ visibility: options.pieceVisibility ?? 'HIDDEN' }));
  mock.method(CatalogRepository, 'findInstrumentsByIds', async () =>
    ('instrument' in options ? (options.instrument ? [options.instrument] : []) : [createInstrument()]) as any
  );
  mock.method(CatalogRepository, 'findCategoriesByIds', async () => ('level' in options ? (options.level ? [options.level] : []) : [levelBasic]) as any);
  mock.method(SheetMusicRepository, 'findMain', async () => (options.main ?? null) as any);
  mock.method(SheetMusicRepository, 'findByName', (options.findByName ?? (async () => null)) as any);
  const attachMock = mock.method(UploadService, 'requireAttachableFile', async (id: string, _ownerId: string, kind: string) =>
    kind === 'SHEET' ? createMediaFile({ id }) : kind === 'AUDIO' ? createAudioFile({ id, durationSec: 6 }) : createMediaFile({ id, kind: 'VIDEO', mimeType: 'video/mp4' })
  );
  const createMock = mock.method(SheetMusicRepository, 'create', (options.create ?? (async (data: any) =>
    createMainSheet({ id: 's-new', ...data, referenceAudio: data.referenceAudioId ? createAudioFile({ id: data.referenceAudioId }) : null })
  )) as any);
  mock.method(SheetMusicRepository, 'findById', async () => {
    const createdData = createMock.mock.calls[0]?.arguments[0] as any;
    return createMainSheet({ id: 's-new', ...createdData, referenceAudio: createdData?.referenceAudioId ? createAudioFile() : null });
  });
  const touchMock = mock.method(PieceRepository, 'touch', async () => undefined as any);
  const requestAnalysisMock = mock.method(AnalysisService, 'requestAnalysis', async () => undefined);
  return { attachMock, createMock, touchMock, requestAnalysisMock };
}

interface UpdateFlowOptions {
  main?: unknown;
  findByName?: () => Promise<unknown>;
  update?: (id: string, data: any) => Promise<unknown>;
}

function mockUpdateFlow(record: any, options: UpdateFlowOptions = {}) {
  mockFindSheet(record);
  mock.method(SheetMusicRepository, 'findByName', (options.findByName ?? (async () => null)) as any);
  mock.method(SheetMusicRepository, 'findMain', async () => (options.main ?? null) as any);
  mock.method(CatalogRepository, 'findInstrumentsByIds', async (ids: string[]) => [createInstrument(ids[0], ids[0] === 'i-sao' ? 'Sáo trúc' : 'Đàn tranh')]);
  mock.method(CatalogRepository, 'findCategoriesByIds', async () => [levelBasic] as any);
  const updateMock = mock.method(SheetMusicRepository, 'update', (options.update ?? (async (id: string, data: any) => ({ ...record, id, ...data }))) as any);
  const touchMock = mock.method(PieceRepository, 'touch', async () => undefined as any);
  const requestAnalysisMock = mock.method(AnalysisService, 'requestAnalysis', async () => undefined);
  const clearAnalysisMock = mock.method(AnalysisService, 'clearAnalysis', async () => undefined);
  return { updateMock, touchMock, requestAnalysisMock, clearAnalysisMock };
}

function mockReplaceFileFlow(record: any, newFile: any) {
  mockFindSheet(record);
  const attachMock = mock.method(UploadService, 'requireAttachableFile', async () => newFile);
  const updateMock = mock.method(SheetMusicRepository, 'update', async (id: string, data: any) => ({ ...record, id, ...data }));
  const discardMock = mock.method(UploadService, 'discardFile', async () => undefined);
  const touchMock = mock.method(PieceRepository, 'touch', async () => undefined as any);
  const requestAnalysisMock = mock.method(AnalysisService, 'requestAnalysis', async () => undefined);
  return { attachMock, updateMock, discardMock, touchMock, requestAnalysisMock };
}

function mockVisibilityFlow(record: any) {
  mockFindSheet(record);
  const updateMock = mock.method(SheetMusicRepository, 'update', async (_id: string, data: any) => ({ ...record, ...data }));
  const touchMock = mock.method(PieceRepository, 'touch', async () => undefined as any);
  return { updateMock, touchMock };
}

describe('SheetMusicService (Giảng viên quản lý bản nhạc)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('getActiveSheetMusic / canManage / getManageableSheetMusic', () => {
    it('trả về bản nhạc đang hoạt động', async () => {
      mockFindSheet(createMainSheet());

      const result = await SheetMusicService.getActiveSheetMusic('s1');

      assert.equal(result.id, 's1');
    });

    it('báo lỗi 404 MSG-08 khi bản nhạc không tồn tại', async () => {
      mockFindSheet(null);

      await assert.rejects(SheetMusicService.getActiveSheetMusic('s-x'), isAppError(404, 'MSG-08', messages.SHEET_NOT_FOUND));
    });

    it('người tải bản nhạc lên được quản lý bản nhạc đó', () => {
      const piece = { ownerId: 'GV-A', visibility: 'PUBLIC', moderation: 'NORMAL' } as any;

      assert.equal(SheetMusicService.canManage('GV-B', { uploaderId: 'GV-B' }, piece), true);
    });

    it('chủ bài hát được quản lý mọi bản nhạc kể cả khi bài đang ẩn', () => {
      const piece = { ownerId: 'GV-A', visibility: 'HIDDEN', moderation: 'NORMAL' } as any;

      assert.equal(SheetMusicService.canManage('GV-A', { uploaderId: 'GV-B' }, piece), true);
    });

    it('người tải lên lấy được bản nhạc của mình để quản lý', async () => {
      mockFindSheet(createLevelSheet());

      const result = await SheetMusicService.getManageableSheetMusic('GV-B', 's2');

      assert.equal(result.id, 's2');
    });

    it('báo lỗi 403 MSG-08 khi bài hát đang bị chủ bài ẩn', async () => {
      mockFindSheet(createLevelSheet({ piece: { ...createLevelSheet().piece, visibility: 'HIDDEN' } }));

      await assert.rejects(SheetMusicService.getManageableSheetMusic('GV-B', 's2'), isAppError(403, 'MSG-08', messages.PIECE_LOCKED));
    });
  });

  describe('sortSheetMusic', () => {
    it('sắp xếp bản chính trước, sau đó theo thứ tự trình độ rồi thời gian tạo', () => {
      const createRow = (name: string, kind: string, displayOrder: number, minute: number): any => ({
        name, kind, level: { displayOrder }, createdAt: new Date(Date.UTC(2026, 9, 20, 0, minute))
      });
      const input = [createRow('Nâng cao', 'LEVEL', 2, 1), createRow('Chính', 'MAIN', 0, 2), createRow('Cơ bản 2', 'LEVEL', 0, 5), createRow('Cơ bản 1', 'LEVEL', 0, 3)];

      const result = SheetMusicService.sortSheetMusic(input);

      assert.deepEqual(result.map((item: any) => item.name), ['Chính', 'Cơ bản 1', 'Cơ bản 2', 'Nâng cao']);
    });
  });

  describe('listForPiece', () => {
    function mockListFlow(sheets: unknown[]) {
      mock.method(PieceRepository, 'findById', async () => createMockPiece({ visibility: 'PUBLIC' }));
      mock.method(SheetMusicRepository, 'listByPiece', async () => sheets as any);
      mock.method(CatalogRepository, 'listActiveInstruments', async () => [
        createInstrument(), createInstrument('i-bau', 'Đàn bầu'), createInstrument('i-sao', 'Sáo trúc')
      ] as any);
    }

    it('nhóm bản nhạc theo nhạc cụ và gợi ý loại bản mặc định cho từng nhạc cụ', async () => {
      mockListFlow([createLevelSheet({ id: 's3', name: 'Nâng cao', level: levelAdvanced }), createMainSheet(), createLevelSheet()]);

      const result: any = await SheetMusicService.listForPiece('GV-B', 'p1');

      assert.equal(result.total, 3);
      assert.equal(result.groups.length, 1);
      assert.deepEqual(result.groups[0].items.map((item: any) => [item.name, item.canManage]), [['Bản chính', false], ['Bản dễ', true], ['Nâng cao', true]]);
      assert.deepEqual(
        result.instrumentOptions.map((option: any) => [option.name, option.hasMain, option.defaultKind]),
        [['Đàn tranh', true, 'LEVEL'], ['Đàn bầu', false, 'MAIN'], ['Sáo trúc', false, 'MAIN']]
      );
    });

    it('giá trị biên: bài chưa có bản nhạc thì mọi nhạc cụ đều gợi ý tạo bản chính', async () => {
      mockListFlow([]);

      const result: any = await SheetMusicService.listForPiece('GV-A', 'p1');

      assert.equal(result.total, 0);
      assert.equal(result.groups.length, 0);
      assert.ok(result.instrumentOptions.every((option: any) => option.defaultKind === 'MAIN'));
    });
  });

  describe('getSheetMusic', () => {
    it('giảng viên khác xem bản chính đang phân tích nhưng không có quyền quản lý', async () => {
      mockFindSheet(createMainSheet({ analysisStatus: 'PROCESSING' }));

      const dto: any = await SheetMusicService.getSheetMusic('GV-C', 's1');

      assert.equal(dto.isMain, true);
      assert.equal(dto.canManage, false);
      assert.equal(dto.canChangeVisibility, false);
      assert.equal(dto.canPublish, true);
      assert.equal(dto.files.audio.durationSec, 6);
      assert.equal(dto.analysis.status, 'PROCESSING');
    });

    it('bản LEVEL dùng bản thu của bản chính và không có thông tin phân tích', async () => {
      mockFindSheet(createLevelSheet());

      const dto: any = await SheetMusicService.getSheetMusic('GV-B', 's2');

      assert.equal(dto.canManage, true);
      assert.equal(dto.usesMainRecording, true);
      assert.equal(dto.analysis, null);
    });
  });

  describe('assertUniqueName / assertMainAvailable / assertPublishable', () => {
    it('báo lỗi 409 MSG-05 khi tên bản đã tồn tại (không phân biệt hoa thường)', async () => {
      mock.method(SheetMusicRepository, 'findByName', async () => ({ id: 's2' }) as any);

      await assert.rejects(SheetMusicService.assertUniqueName('p1', 'BẢN DỄ'), isAppError(409, 'MSG-05', messages.NAME_USED, 'name'));
    });

    it('chấp nhận tên bản chưa được dùng', async () => {
      const findByNameMock = mock.method(SheetMusicRepository, 'findByName', async () => null);

      await SheetMusicService.assertUniqueName('p1', 'Bản mới');

      assert.deepEqual(findByNameMock.mock.calls[0].arguments, ['p1', 'Bản mới', undefined]);
    });

    it('báo lỗi 409 MSG-08 khi nhạc cụ đã có bản chính', async () => {
      mock.method(SheetMusicRepository, 'findMain', async () => ({ id: 's1' }) as any);

      await assert.rejects(SheetMusicService.assertMainAvailable('p1', 'i-tranh'), isAppError(409, 'MSG-08', messages.MAIN_EXISTS, 'kind'));
    });

    it('giá trị biên: bản chính đang được sửa không bị coi là trùng với chính nó', async () => {
      mock.method(SheetMusicRepository, 'findMain', async () => ({ id: 's1' }) as any);

      await assert.doesNotReject(SheetMusicService.assertMainAvailable('p1', 'i-tranh', 's1'));
    });

    it('báo lỗi 409 MSG-08 khi công khai bản chính chưa có bản thu mẫu', () => {
      assert.throws(() => SheetMusicService.assertPublishable('MAIN', 'PUBLIC', false), isAppError(409, 'MSG-08', messages.NEEDS_AUDIO, 'visibility'));
    });

    it('cho công khai bản chính đã có bản thu mẫu', () => {
      assert.doesNotThrow(() => SheetMusicService.assertPublishable('MAIN', 'PUBLIC', true));
    });

    it('cho công khai bản LEVEL không có bản thu (dùng bản thu của bản chính)', () => {
      assert.doesNotThrow(() => SheetMusicService.assertPublishable('LEVEL', 'PUBLIC', false));
    });
  });

  describe('mapUniqueViolation', () => {
    const sheetState = { pieceId: 'p1', instrumentId: 'i-tranh', kind: 'MAIN', name: 'Bản chính' } as any;

    it('lỗi P2002 do trùng tên được chuyển thành 409 MSG-05', async () => {
      mock.method(SheetMusicRepository, 'findByName', async () => ({ id: 's9' }) as any);

      await assert.rejects(SheetMusicService.mapUniqueViolation(uniqueViolation(), sheetState), isAppError(409, 'MSG-05', messages.NAME_USED, 'name'));
    });

    it('lỗi P2002 do trùng bản chính được chuyển thành 409 MSG-08', async () => {
      mock.method(SheetMusicRepository, 'findByName', async () => null);
      mock.method(SheetMusicRepository, 'findMain', async () => ({ id: 's9' }) as any);

      await assert.rejects(SheetMusicService.mapUniqueViolation(uniqueViolation(), sheetState), isAppError(409, 'MSG-08', messages.MAIN_EXISTS, 'kind'));
    });
  });

  describe('createSheetMusic', () => {
    it('tạo bản chính kèm bản thu mẫu: công khai, cập nhật bài hát và gửi yêu cầu phân tích', async () => {
      const { createMock, touchMock, requestAnalysisMock } = mockCreateFlow();

      const dto: any = await SheetMusicService.createSheetMusic('GV-A', 'p1', { ...sheetInput, referenceAudioId: 'a1' } as any);

      const data = createMock.mock.calls[0].arguments[0] as any;
      assert.equal(data.kind, 'MAIN');
      assert.equal(data.mainInstrumentId, 'i-tranh');
      assert.equal(data.visibility, 'PUBLIC');
      assert.equal(data.referenceAudioId, 'a1');
      assert.equal(data.durationSec, 6);
      assert.equal(data.uploaderId, 'GV-A');
      assert.deepEqual(touchMock.mock.calls.map((call) => call.arguments), [['p1']]);
      assert.equal(requestAnalysisMock.mock.callCount(), 1);
      assert.equal((requestAnalysisMock.mock.calls[0].arguments[0] as any).id, 's-new');
      assert.equal(dto.isMain, true);
    });

    it('nhạc cụ đã có bản chính thì bản mới mặc định là LEVEL', async () => {
      const { createMock } = mockCreateFlow({ main: createMainSheet() });

      await SheetMusicService.createSheetMusic('GV-A', 'p1', { ...sheetInput, name: 'Bản dễ', sheetFileId: 'f2' } as any);

      const data = createMock.mock.calls[0].arguments[0] as any;
      assert.equal(data.kind, 'LEVEL');
      assert.equal(data.mainInstrumentId, null);
      assert.equal(data.visibility, 'PUBLIC');
    });

    it('báo lỗi 403 MSG-08 và KHÔNG tạo khi giảng viên khác thêm bản vào bài đang ẩn', async () => {
      const { createMock } = mockCreateFlow();

      await assert.rejects(
        SheetMusicService.createSheetMusic('GV-B', 'p1', { ...sheetInput, name: 'Bản của B' } as any),
        isAppError(403, 'MSG-08', messages.PIECE_LOCKED)
      );
      assert.equal(createMock.mock.callCount(), 0);
    });

    it('gắn đủ ba file: bản nhạc, bản thu mẫu và video hướng dẫn', async () => {
      const { attachMock } = mockCreateFlow();

      await SheetMusicService.createSheetMusic('GV-A', 'p1', { ...sheetInput, referenceAudioId: 'a1', tutorialVideoId: 'v1' } as any);

      assert.deepEqual(attachMock.mock.calls.map((call) => call.arguments), [
        ['f1', 'GV-A', 'SHEET', 'sheetFileId'],
        ['a1', 'GV-A', 'AUDIO', 'referenceAudioId'],
        ['v1', 'GV-A', 'VIDEO', 'tutorialVideoId']
      ]);
    });

    it('báo lỗi 409 MSG-08 và KHÔNG gắn file khi tạo bản chính thứ hai cho cùng nhạc cụ', async () => {
      const { attachMock, createMock } = mockCreateFlow({ main: createMainSheet() });

      await assert.rejects(
        SheetMusicService.createSheetMusic('GV-A', 'p1', { ...sheetInput, kind: 'MAIN' } as any),
        isAppError(409, 'MSG-08', messages.MAIN_EXISTS, 'kind')
      );
      assert.equal(attachMock.mock.callCount(), 0);
      assert.equal(createMock.mock.callCount(), 0);
    });

    it('báo lỗi 409 MSG-08 và KHÔNG tạo khi công khai bản chính chưa có bản thu mẫu', async () => {
      const { createMock } = mockCreateFlow();

      await assert.rejects(
        SheetMusicService.createSheetMusic('GV-A', 'p1', { ...sheetInput, visibility: 'PUBLIC' } as any),
        isAppError(409, 'MSG-08', messages.NEEDS_AUDIO, 'visibility')
      );
      assert.equal(createMock.mock.callCount(), 0);
    });

    it('báo lỗi 409 MSG-05 và KHÔNG tạo khi tên bản đã tồn tại', async () => {
      const { createMock } = mockCreateFlow({ findByName: async () => ({ id: 's9' }) });

      await assert.rejects(
        SheetMusicService.createSheetMusic('GV-A', 'p1', { ...sheetInput, name: 'bản chính' } as any),
        isAppError(409, 'MSG-05', messages.NAME_USED, 'name')
      );
      assert.equal(createMock.mock.callCount(), 0);
    });

    it('báo lỗi 400 MSG-08 khi nhạc cụ đã ngưng hoạt động', async () => {
      mockCreateFlow({ instrument: createInstrument('i-bau', 'Đàn bầu', { isActive: false }) });

      await assert.rejects(
        SheetMusicService.createSheetMusic('GV-A', 'p1', { ...sheetInput, instrumentId: 'i-bau' } as any),
        isAppError(400, 'MSG-08', messages.CATEGORY_INACTIVE, 'instrumentId')
      );
    });

    it('báo lỗi 404 MSG-08 khi bài hát không tồn tại', async () => {
      mock.method(PieceRepository, 'findById', async () => null);

      await assert.rejects(SheetMusicService.createSheetMusic('GV-A', 'p-x', sheetInput as any), isAppError(404, 'MSG-08', messages.PIECE_NOT_FOUND));
    });

    it('request khác lưu cùng tên trước (P2002): báo 409 MSG-05, KHÔNG cập nhật bài và KHÔNG phân tích', async () => {
      let nameChecks = 0;
      const { touchMock, requestAnalysisMock } = mockCreateFlow({
        findByName: async () => (nameChecks++ === 0 ? null : { id: 's9' }),
        create: async () => {
          throw uniqueViolation();
        }
      });

      await assert.rejects(SheetMusicService.createSheetMusic('GV-A', 'p1', sheetInput as any), isAppError(409, 'MSG-05', messages.NAME_USED, 'name'));
      assert.equal(touchMock.mock.callCount(), 0);
      assert.equal(requestAnalysisMock.mock.callCount(), 0);
    });
  });

  describe('assertVisibilityChangeAllowed', () => {
    it('báo lỗi 409 MSG-08 khi đổi hiển thị bản nhạc bị admin ẩn', () => {
      assert.throws(
        () => SheetMusicService.assertVisibilityChangeAllowed({ visibility: 'PUBLIC', moderation: 'ADMIN_HIDDEN' } as any, 'HIDDEN'),
        isAppError(409, 'MSG-08', messages.SHEET_ADMIN_HIDDEN, 'visibility')
      );
    });
  });

  describe('updateSheetMusic', () => {
    it('đổi tên bản LEVEL: cập nhật bài hát, KHÔNG thay đổi phân tích', async () => {
      const { updateMock, touchMock, requestAnalysisMock, clearAnalysisMock } = mockUpdateFlow(createLevelSheet());

      await SheetMusicService.updateSheetMusic('GV-B', 's2', { name: 'Bản rất dễ' } as any);

      assert.deepEqual(updateMock.mock.calls[0].arguments, ['s2', { instrumentId: 'i-tranh', kind: 'LEVEL', mainInstrumentId: null, name: 'Bản rất dễ' }]);
      assert.deepEqual(touchMock.mock.calls.map((call) => call.arguments), [['p1']]);
      assert.equal(requestAnalysisMock.mock.callCount(), 0);
      assert.equal(clearAnalysisMock.mock.callCount(), 0);
    });

    it('chuyển bản chính thành LEVEL thì xóa kết quả phân tích', async () => {
      const { updateMock, clearAnalysisMock } = mockUpdateFlow(createMainSheet());

      await SheetMusicService.updateSheetMusic('GV-A', 's1', { kind: 'LEVEL' } as any);

      assert.equal((updateMock.mock.calls[0].arguments[1] as any).mainInstrumentId, null);
      assert.deepEqual(clearAnalysisMock.mock.calls.map((call) => call.arguments), [['s1']]);
    });

    it('chuyển bản LEVEL có bản thu thành bản chính thì gửi yêu cầu phân tích', async () => {
      const { updateMock, requestAnalysisMock } = mockUpdateFlow(createLevelSheet({ referenceAudio: createAudioFile({ id: 'a2' }) }));

      await SheetMusicService.updateSheetMusic('GV-B', 's2', { kind: 'MAIN' } as any);

      assert.equal((updateMock.mock.calls[0].arguments[1] as any).mainInstrumentId, 'i-tranh');
      assert.equal(requestAnalysisMock.mock.callCount(), 1);
    });

    it('request khác lưu cùng tên trước (P2002): báo 409 MSG-05 và KHÔNG cập nhật bài hát', async () => {
      let nameChecks = 0;
      const { touchMock } = mockUpdateFlow(createLevelSheet(), {
        findByName: async () => (nameChecks++ === 0 ? null : { id: 's9' }),
        update: async () => {
          throw uniqueViolation();
        }
      });

      await assert.rejects(SheetMusicService.updateSheetMusic('GV-B', 's2', { name: 'Bản chính' } as any), isAppError(409, 'MSG-05', messages.NAME_USED, 'name'));
      assert.equal(touchMock.mock.callCount(), 0);
    });
  });

  describe('assertUpdateRules', () => {
    const nextState = (overrides: Record<string, unknown>) => ({ pieceId: 'p1', instrumentId: 'i-tranh', kind: 'LEVEL', name: 'Bản dễ', ...overrides }) as any;

    it('báo lỗi 400 MSG-08 khi đổi sang nhạc cụ đã ngưng hoạt động', async () => {
      mock.method(CatalogRepository, 'findInstrumentsByIds', async () => [createInstrument('i-bau', 'Đàn bầu', { isActive: false })]);

      await assert.rejects(
        SheetMusicService.assertUpdateRules(createLevelSheet(), { instrumentId: 'i-bau' } as any, nextState({ instrumentId: 'i-bau' })),
        isAppError(400, 'MSG-08', messages.CATEGORY_INACTIVE, 'instrumentId')
      );
    });

    it('báo lỗi 409 MSG-08 khi đổi thành bản chính mà nhạc cụ đã có bản chính', async () => {
      mock.method(SheetMusicRepository, 'findMain', async () => ({ id: 's1' }) as any);

      await assert.rejects(
        SheetMusicService.assertUpdateRules(createLevelSheet(), { kind: 'MAIN' } as any, nextState({ kind: 'MAIN' })),
        isAppError(409, 'MSG-08', messages.MAIN_EXISTS, 'kind')
      );
    });

    it('báo lỗi 409 MSG-08 khi đổi bản LEVEL công khai không có bản thu thành bản chính', async () => {
      mock.method(SheetMusicRepository, 'findMain', async () => null);

      await assert.rejects(
        SheetMusicService.assertUpdateRules(createLevelSheet(), { kind: 'MAIN' } as any, nextState({ kind: 'MAIN' })),
        isAppError(409, 'MSG-08', messages.NEEDS_AUDIO, 'visibility')
      );
    });
  });

  describe('syncAnalysisAfterUpdate', () => {
    it('bản chính chuyển thành LEVEL thì xóa kết quả phân tích', async () => {
      const requestAnalysisMock = mock.method(AnalysisService, 'requestAnalysis', async () => undefined);
      const clearAnalysisMock = mock.method(AnalysisService, 'clearAnalysis', async () => undefined);

      await SheetMusicService.syncAnalysisAfterUpdate(createMainSheet(), createMainSheet({ kind: 'LEVEL' }));

      assert.deepEqual(clearAnalysisMock.mock.calls.map((call) => call.arguments), [['s1']]);
      assert.equal(requestAnalysisMock.mock.callCount(), 0);
    });

    it('bản LEVEL chuyển thành bản chính thì gửi yêu cầu phân tích', async () => {
      const requestAnalysisMock = mock.method(AnalysisService, 'requestAnalysis', async () => undefined);
      const clearAnalysisMock = mock.method(AnalysisService, 'clearAnalysis', async () => undefined);

      await SheetMusicService.syncAnalysisAfterUpdate(createLevelSheet(), createMainSheet());

      assert.equal(requestAnalysisMock.mock.callCount(), 1);
      assert.equal(clearAnalysisMock.mock.callCount(), 0);
    });
  });

  describe('replaceFile', () => {
    it('thay file bản nhạc: giữ nguyên id, xóa file cũ và KHÔNG phân tích lại (GBR-43)', async () => {
      const { attachMock, updateMock, discardMock, touchMock, requestAnalysisMock } = mockReplaceFileFlow(createMainSheet(), createMediaFile({ id: 'f-new' }));

      const dto: any = await SheetMusicService.replaceFile('GV-A', 's1', 'sheet', 'f-new');

      assert.deepEqual(attachMock.mock.calls.map((call) => call.arguments), [['f-new', 'GV-A', 'SHEET', 'fileId']]);
      assert.deepEqual(updateMock.mock.calls.map((call) => call.arguments), [['s1', { sheetFileId: 'f-new' }]]);
      assert.equal((discardMock.mock.calls[0].arguments[0] as any).id, 'f1');
      assert.deepEqual(touchMock.mock.calls.map((call) => call.arguments), [['p1']]);
      assert.equal(requestAnalysisMock.mock.callCount(), 0);
      assert.equal(dto.id, 's1');
    });

    it('thay bản thu mẫu: cập nhật thời lượng, giữ file cũ cho job đang chạy và gửi yêu cầu phân tích', async () => {
      const { updateMock, discardMock, requestAnalysisMock } = mockReplaceFileFlow(createMainSheet(), createAudioFile({ id: 'a-new', durationSec: 9 }));

      await SheetMusicService.replaceFile('GV-A', 's1', 'audio', 'a-new');

      assert.deepEqual(updateMock.mock.calls.map((call) => call.arguments), [['s1', { referenceAudioId: 'a-new', durationSec: 9 }]]);
      assert.equal(discardMock.mock.callCount(), 0);
      assert.equal(requestAnalysisMock.mock.callCount(), 1);
    });

    it('giá trị biên: thêm video hướng dẫn khi chưa có thì discardFile nhận null', async () => {
      const { updateMock, discardMock } = mockReplaceFileFlow(createMainSheet(), createMediaFile({ id: 'v1', kind: 'VIDEO' }));

      await SheetMusicService.replaceFile('GV-A', 's1', 'video', 'v1');

      assert.deepEqual(updateMock.mock.calls.map((call) => call.arguments), [['s1', { tutorialVideoId: 'v1' }]]);
      assert.deepEqual(discardMock.mock.calls.map((call) => call.arguments), [[null]]);
    });
  });

  describe('setVisibility', () => {
    it('ẩn bản chính và cập nhật thời gian sửa bài hát', async () => {
      const { updateMock, touchMock } = mockVisibilityFlow(createMainSheet());

      await SheetMusicService.setVisibility('GV-A', 's1', 'HIDDEN');

      assert.deepEqual(updateMock.mock.calls.map((call) => call.arguments), [['s1', { visibility: 'HIDDEN' }]]);
      assert.deepEqual(touchMock.mock.calls.map((call) => call.arguments), [['p1']]);
    });

    it('báo lỗi 409 MSG-08 và KHÔNG cập nhật khi bản nhạc bị admin ẩn', async () => {
      const { updateMock } = mockVisibilityFlow(createMainSheet({ moderation: 'ADMIN_HIDDEN' }));

      await assert.rejects(SheetMusicService.setVisibility('GV-A', 's1', 'PUBLIC'), isAppError(409, 'MSG-08', messages.SHEET_ADMIN_HIDDEN, 'visibility'));
      assert.equal(updateMock.mock.callCount(), 0);
    });

    it('báo lỗi 409 MSG-08 và KHÔNG cập nhật khi công khai bản chính chưa có bản thu mẫu', async () => {
      const { updateMock } = mockVisibilityFlow(createMainSheet({ visibility: 'HIDDEN', referenceAudio: null }));

      await assert.rejects(SheetMusicService.setVisibility('GV-A', 's1', 'PUBLIC'), isAppError(409, 'MSG-08', messages.NEEDS_AUDIO, 'visibility'));
      assert.equal(updateMock.mock.callCount(), 0);
    });
  });
});
