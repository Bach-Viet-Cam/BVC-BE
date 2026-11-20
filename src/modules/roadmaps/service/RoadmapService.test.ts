import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import ClassRepository from '../../classes/repository/ClassRepository.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import RoadmapConstant from '../constant/RoadmapConstant.ts';
import RoadmapRepository from '../repository/RoadmapRepository.ts';
import RoadmapService from './RoadmapService.ts';

const messages = RoadmapConstant.messages;

function createMockRoadmapRecord(overrides: Partial<Backend.RoadmapRecord> = {}): Backend.RoadmapRecord {
  return {
    id: 'roadmap-v1',
    instrumentId: 'inst-tranh',
    version: 1,
    createdById: 'admin-1',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    instrument: { id: 'inst-tranh', name: 'Đàn tranh' },
    weeks: Array.from({ length: 6 }, (_, index) => ({
      id: `w-${index + 1}`,
      roadmapId: 'roadmap-v1',
      weekNumber: index + 1,
      title: `Tuần ${index + 1}`,
      content: `Nội dung tuần ${index + 1}`,
      exercises: []
    })),
    ...overrides
  } as unknown as Backend.RoadmapRecord;
}

const mockInstrument = { id: 'inst-tranh', name: 'Đàn tranh' };

function createValidWeekInputs(): Backend.RoadmapWeekInput[] {
  return Array.from({ length: 6 }, (_, index) => ({
    weekNumber: index + 1,
    title: `Tiêu đề tuần ${index + 1}`,
    content: `Nội dung học tập tuần ${index + 1}`,
    exerciseIds: []
  }));
}

describe('RoadmapService (UC-11 Learning Roadmap)', () => {
  const fakeTx = {} as any;
  const originalTransaction = PrismaClientProvider.instance.$transaction;

  beforeEach(() => {
    (PrismaClientProvider.instance as any).$transaction = async (arg: any) => {
      if (typeof arg === 'function') {
        return arg(fakeTx);
      }
      return Promise.all(arg);
    };
  });

  afterEach(() => {
    (PrismaClientProvider.instance as any).$transaction = originalTransaction;
    mock.restoreAll();
  });

  describe('listInstruments', () => {
    it('trả về danh sách nhạc cụ đang hoạt động kèm thông tin phiên bản lộ trình mới nhất', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrumentsWithLatestVersion', async () => [
        { id: 'inst-1', name: 'Đàn tranh', roadmaps: [{ version: 2, createdAt: new Date('2026-09-01') }] },
        { id: 'inst-2', name: 'Sáo trúc', roadmaps: [] } // Chưa có lộ trình
      ]);

      const result = await RoadmapService.listInstruments();
      assert.equal(result.length, 2);
      assert.equal(result[0].instrument.name, 'Đàn tranh');
      assert.equal(result[0].latestVersion?.version, 2);
      assert.equal(result[1].instrument.name, 'Sáo trúc');
      assert.equal(result[1].latestVersion, null);
    });

    it('giá trị biên: không có nhạc cụ nào đang hoạt động', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrumentsWithLatestVersion', async () => []);

      const result = await RoadmapService.listInstruments();
      assert.deepEqual(result, []);
    });
  });

  describe('getEditableRoadmap (Xem và khởi tạo mẫu khung 6 tuần - TC-M03-041, TC-M03-042)', () => {
    it('nhạc cụ đã có lộ trình: tải phiên bản mới nhất (isTemplate = false)', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findLatestRoadmap', async () => createMockRoadmapRecord({ version: 2 }));

      const result = await RoadmapService.getEditableRoadmap('inst-tranh');
      assert.equal(result.isTemplate, false);
      assert.equal(result.version, 2);
      assert.equal(result.weeks.length, 6);
    });

    it('nhạc cụ chưa có lộ trình: nạp sẵn khung chuẩn 6 tuần (isTemplate = true, version = null)', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findLatestRoadmap', async () => null);

      const result = await RoadmapService.getEditableRoadmap('inst-tranh');
      assert.equal(result.isTemplate, true);
      assert.equal(result.version, null);
      assert.equal(result.weeks.length, 6);
      assert.equal(result.weeks[0].title, RoadmapConstant.standardFrameworkTitles[0]);
      assert.equal(result.weeks[5].title, RoadmapConstant.standardFrameworkTitles[5]);
      assert.equal(result.weeks[0].content, '');
    });

    it('báo lỗi 404 khi nhạc cụ không tồn tại hoặc không hoạt động', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => null);

      await assert.rejects(
        RoadmapService.getEditableRoadmap('non-existent-inst'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === messages.INSTRUMENT_NOT_FOUND
      );
    });
  });

  describe('listFingerExercises', () => {
    it('lấy danh sách bài luyện ngón theo nhạc cụ', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findFingerExercises', async () => [
        { id: 'p-1', title: 'Luyện ngón 1', pieceTitle: 'Lưu thủy', bpm: 80, isAvailable: true }
      ]);

      const result = await RoadmapService.listFingerExercises('inst-tranh');
      assert.equal(result.length, 1);
      assert.equal(result[0].title, 'Luyện ngón 1');
    });
  });

  describe('saveVersion (Lưu phiên bản mới & Stale version blocked)', () => {
    it('lưu phiên bản mới thành công (v1 lên v2) và gán cho các lớp đang hoạt động', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findPiecesByIds', async () => []);
      mock.method(RoadmapRepository, 'findMaxVersion', async () => 1); // Hiện tại là v1

      const createRoadmapMock = mock.method(RoadmapRepository, 'createRoadmapVersion', async () => ({ id: 'new-v2-id' }));
      const backfillMock = mock.method(RoadmapRepository, 'backfillActiveClasses', async () => {});

      const newRecord = createMockRoadmapRecord({ id: 'new-v2-id', version: 2 });
      mock.method(RoadmapRepository, 'findRoadmapById', async () => newRecord);

      const result = await RoadmapService.saveVersion('inst-tranh', 'admin-1', createValidWeekInputs(), 1);

      assert.equal(createRoadmapMock.mock.callCount(), 1);
      assert.equal(createRoadmapMock.mock.calls[0].arguments[0].version, 2); // 1 + 1 = 2
      assert.equal(backfillMock.mock.callCount(), 1);
      assert.equal(result.version, 2);
    });

    it('stale version blocked: ném 409 conflict VERSION_CONFLICT khi phiên bản bị cũ (lost-update guard)', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findPiecesByIds', async () => []);

      // Admin đang chỉnh sửa trên baseVersion 1, nhưng CSDL đã lên version 2 do admin khác vừa lưu
      mock.method(RoadmapRepository, 'findMaxVersion', async () => 2);

      await assert.rejects(
        RoadmapService.saveVersion('inst-tranh', 'admin-1', createValidWeekInputs(), 1),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.message === messages.VERSION_CONFLICT
      );
    });

    it('stale version blocked: ném 409 conflict khi tạo phiên bản đầu tiên (baseVersion = null) nhưng CSDL đã có v1', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findPiecesByIds', async () => []);
      mock.method(RoadmapRepository, 'findMaxVersion', async () => 1);

      await assert.rejects(
        RoadmapService.saveVersion('inst-tranh', 'admin-1', createValidWeekInputs(), null),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.message === messages.VERSION_CONFLICT
      );
    });

    it('bắt lỗi vi phạm unique index từ CSDL (P2002) và chuyển thành 409 VERSION_CONFLICT', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findPiecesByIds', async () => []);
      mock.method(RoadmapRepository, 'findMaxVersion', async () => 0);

      mock.method(RoadmapRepository, 'createRoadmapVersion', async () => {
        const p2002 = new Error('Unique constraint failed') as any;
        p2002.code = 'P2002';
        throw p2002;
      });

      await assert.rejects(
        RoadmapService.saveVersion('inst-tranh', 'admin-1', createValidWeekInputs(), null),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.message === messages.VERSION_CONFLICT
      );
    });

    it('ném 400 INVALID_DATA khi dữ liệu các tuần không hợp lệ (ví dụ: thiếu nội dung tuần 3 - TC-M03-044)', async () => {
      mock.method(RoadmapRepository, 'findActiveInstrument', async () => mockInstrument);
      mock.method(RoadmapRepository, 'findPiecesByIds', async () => []);

      const badWeeks = createValidWeekInputs();
      badWeeks[2].content = ''; // Tuần 3 rỗng nội dung

      await assert.rejects(
        RoadmapService.saveVersion('inst-tranh', 'admin-1', badWeeks, 1),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.message === messages.INVALID_DATA &&
          Boolean(err.fieldErrors?.some((e) => e.field === 'weeks.3.content'))
      );
    });
  });

  describe('getClassRoadmap (Xem lộ trình lớp học - TC-M03-048, TC-M03-049)', () => {
    const fixedNow = new Date('2026-09-10T10:00:00+07:00'); // Ngày 10/09/2026

    const mockClass = {
      id: 'class-1',
      name: 'TRN101.1',
      status: 'ACTIVE',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      roadmapId: 'roadmap-v1',
      ownerId: 'lecturer-1',
      coLecturers: []
    } as any;

    it('giảng viên phụ trách xem lộ trình lớp học: tính đúng trạng thái PAST, CURRENT, UPCOMING cho 6 tuần', async () => {
      const viewer: Backend.UserDTO = { userId: 'lecturer-1', role: AuthConstant.roles.TEACHER, email: 't@fpt.edu.vn', fullName: 'Giảng viên' };
      mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClass);
      mock.method(RoadmapRepository, 'findRoadmapById', async () => createMockRoadmapRecord());

      const result = await RoadmapService.getClassRoadmap('class-1', viewer, fixedNow);

      assert.ok(result.roadmap);
      assert.equal(result.roadmap.weeks.length, 6);

      // Tuần 1: 01/09 -> 07/09. Hôm nay 10/09 -> PAST
      assert.equal(result.roadmap.weeks[0].weekNumber, 1);
      assert.equal(result.roadmap.weeks[0].status, 'PAST');
      assert.equal(result.roadmap.weeks[0].startDate, '2026-09-01');
      assert.equal(result.roadmap.weeks[0].endDate, '2026-09-07');

      // Tuần 2: 08/09 -> 14/09. Hôm nay 10/09 -> CURRENT
      assert.equal(result.roadmap.weeks[1].weekNumber, 2);
      assert.equal(result.roadmap.weeks[1].status, 'CURRENT');

      // Tuần 3: 15/09 -> 21/09. Hôm nay 10/09 -> UPCOMING
      assert.equal(result.roadmap.weeks[2].weekNumber, 3);
      assert.equal(result.roadmap.weeks[2].status, 'UPCOMING');
    });

    it('sinh viên xem lộ trình lớp mình đang học (read-only view - TC-M03-049)', async () => {
      const studentViewer: Backend.UserDTO = { userId: 'student-1', role: AuthConstant.roles.STUDENT, email: 's@fpt.edu.vn', fullName: 'Sinh viên' };
      mock.method(ClassRepository, 'findClassById', async () => mockClass);
      mock.method(MemberRepository, 'findActiveMembership', async () => ({ id: 'mem-1' }));
      mock.method(RoadmapRepository, 'findRoadmapById', async () => createMockRoadmapRecord());

      const result = await RoadmapService.getClassRoadmap('class-1', studentViewer, fixedNow);
      assert.ok(result.roadmap);
      assert.equal(result.roadmap.version, 1);
    });

    it('sinh viên không thuộc lớp hoặc giảng viên không phụ trách: bị từ chối 404', async () => {
      const strangerStudent: Backend.UserDTO = { userId: 'stranger-s', role: AuthConstant.roles.STUDENT, email: 'stranger@fpt.edu.vn', fullName: 'Người ngoài' };
      mock.method(ClassRepository, 'findClassById', async () => mockClass);
      mock.method(MemberRepository, 'findActiveMembership', async () => null);

      await assert.rejects(
        RoadmapService.getClassRoadmap('class-1', strangerStudent, fixedNow),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });

    it('giá trị biên: lớp học chưa gắn lộ trình (roadmapId = null)', async () => {
      const viewer: Backend.UserDTO = { userId: 'lecturer-1', role: AuthConstant.roles.TEACHER, email: 't@fpt.edu.vn', fullName: 'Giảng viên' };
      mock.method(ClassAccessService, 'assertOwnedClass', async () => ({ ...mockClass, roadmapId: null }));

      const result = await RoadmapService.getClassRoadmap('class-1', viewer, fixedNow);
      assert.deepEqual(result, { roadmap: null });
    });
  });

  describe('isUniqueViolation', () => {
    it('trả về true khi error.code là P2002', () => {
      assert.equal(RoadmapService.isUniqueViolation({ code: 'P2002' }), true);
    });

    it('trả về false khi error không phải P2002 hoặc null/undefined', () => {
      assert.equal(RoadmapService.isUniqueViolation({ code: 'P2003' }), false);
      assert.equal(RoadmapService.isUniqueViolation(null), false);
      assert.equal(RoadmapService.isUniqueViolation(undefined), false);
    });
  });
});
