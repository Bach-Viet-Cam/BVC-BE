import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import AssignmentRepository from '../repository/AssignmentRepository.ts';
import AssignmentAccessService from './AssignmentAccessService.ts';
import AssignmentService from './AssignmentService.ts';

const messages = AssignmentConstant.messages;
const notifications = AssignmentConstant.notifications;

function createMockAssignmentRecord(overrides: Partial<Backend.AssignmentRecord> = {}): Backend.AssignmentRecord {
  return {
    id: 'asg-1',
    classId: 'class-1',
    createdById: 'lecturer-1',
    status: 'DRAFT',
    deadline: new Date('2026-12-31T00:00:00.000Z'),
    maxSubmissions: 3,
    publishedAt: null,
    closedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    class: {
      id: 'class-1',
      name: 'TRN101.1',
      cohort: 'FA26',
      status: 'ACTIVE',
      instrumentId: 'inst-tranh',
      ownerId: 'lecturer-1',
      coLecturers: []
    },
    currentVersion: {
      id: 'ver-1',
      version: 1,
      assignmentId: 'asg-1',
      title: 'Luyện ngón căn bản',
      description: 'Mô tả bài tập',
      kind: 'OTHER',
      requiredBpm: 80,
      sheetMusicId: 'sheet-1',
      sheetMusic: {
        id: 'sheet-1',
        name: 'Sheet Lưu thủy',
        visibility: 'PUBLIC',
        moderation: 'NORMAL',
        piece: {
          id: 'piece-1',
          title: 'Lưu thủy hành vân',
          bpm: 75,
          visibility: 'PUBLIC',
          moderation: 'NORMAL',
          deletedAt: null
        }
      },
      createdById: 'lecturer-1',
      createdAt: new Date('2026-10-01T00:00:00.000Z')
    },
    ...overrides
  } as unknown as Backend.AssignmentRecord;
}

const mockClassRecord: Backend.ClassRecord = {
  id: 'class-1',
  name: 'TRN101.1',
  cohort: 'FA26',
  description: 'Lớp đàn tranh',
  instrumentId: 'inst-tranh',
  ownerId: 'lecturer-1',
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T00:00:00.000Z'),
  status: 'ACTIVE',
  endedAt: null,
  roadmapId: 'roadmap-1',
  createdAt: new Date('2026-08-15T00:00:00.000Z'),
  instrument: { id: 'inst-tranh', name: 'Đàn tranh' },
  owner: { id: 'lecturer-1', username: 'lecturer1', email: 'lecturer1@fpt.edu.vn' },
  coLecturers: [],
  _count: { members: 20 }
};

describe('AssignmentService (UC-13 Assignment Management)', () => {
  const fakeTx = {} as any;
  const originalTransaction = PrismaClientProvider.instance.$transaction;

  beforeEach(() => {
    (PrismaClientProvider.instance as any).$transaction = async (arg: any) => {
      if (typeof arg === 'function') {
        return arg(fakeTx);
      }
      return Promise.all(arg);
    };
    mock.method(AuditLogger, 'record', async () => {});
  });

  afterEach(() => {
    (PrismaClientProvider.instance as any).$transaction = originalTransaction;
    mock.restoreAll();
  });

  describe('createAssignment (Tạo bài tập & class notification)', () => {
    const validInput: Backend.CreateAssignmentInput = {
      classId: 'class-1',
      title: 'Bài tập luyện ngón 1',
      description: 'Thực hành kỹ thuật rải ngón',
      kind: 'OTHER',
      sheetMusicId: 'sheet-1',
      requiredBpm: 80,
      maxSubmissions: 3,
      publish: false
    };

    it('tạo bài tập dạng bản nháp (DRAFT) thành công: tạo version 1 và KHÔNG gửi thông báo cho lớp', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
      mock.method(AssignmentRepository, 'existsKindInClass', async () => false);

      const createAssignmentMock = mock.method(AssignmentRepository, 'createAssignment', async () => ({ id: 'new-asg-id' }));
      const createVersionMock = mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      const createdRecord = createMockAssignmentRecord({ id: 'new-asg-id', status: 'DRAFT' });
      mock.method(AssignmentRepository, 'findById', async () => createdRecord);

      const result = await AssignmentService.createAssignment('lecturer-1', validInput);

      assert.equal(createAssignmentMock.mock.callCount(), 1);
      assert.equal(createVersionMock.mock.callCount(), 1);
      assert.equal(createVersionMock.mock.calls[0].arguments[1], 1); // version 1
      assert.equal(notifyMock.mock.callCount(), 0); // không gửi thông báo khi lưu nháp
      assert.equal(result.id, 'new-asg-id');
      assert.equal(result.status, 'DRAFT');
    });

    it('tạo bài tập và đăng ngay (publish = true): gửi thông báo tới tất cả thành viên trong lớp', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
      mock.method(AssignmentRepository, 'existsKindInClass', async () => false);
      mock.method(AssignmentRepository, 'createAssignment', async () => ({ id: 'published-asg-id' }));
      mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});
      mock.method(MemberRepository, 'findActiveMemberIds', async () => ['student-1', 'student-2']);

      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});
      const publishedRecord = createMockAssignmentRecord({ id: 'published-asg-id', status: 'PUBLISHED', publishedAt: new Date() });
      mock.method(AssignmentRepository, 'findById', async () => publishedRecord);

      const result = await AssignmentService.createAssignment('lecturer-1', { ...validInput, publish: true });

      assert.equal(notifyMock.mock.callCount(), 1);
      assert.deepEqual(notifyMock.mock.calls[0].arguments[1], ['student-1', 'student-2']);
      assert.equal(notifyMock.mock.calls[0].arguments[2].title, notifications.PUBLISHED_TITLE);
      assert.equal(result.status, 'PUBLISHED');
    });

    it('báo lỗi 404 khi giảng viên không sở hữu lớp học', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.notFound('Không tìm thấy lớp học.');
      });

      await assert.rejects(
        AssignmentService.createAssignment('unauthorized-lecturer', validInput),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });

    it('báo lỗi 409 MSG-08 khi lớp học đã kết thúc (ended classes are read-only)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.conflict('Không thể thay đổi lớp vì lớp đã kết thúc.', { code: 'MSG-08' });
      });

      await assert.rejects(
        AssignmentService.createAssignment('lecturer-1', validInput),
        (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'MSG-08'
      );
    });

    it('báo lỗi 400 MSG-48 khi bản nhạc không khả dụng cho nhạc cụ của lớp (assertSheetMusicSelectable)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
      // Bản nhạc không khả dụng
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => false);

      await assert.rejects(
        AssignmentService.createAssignment('lecturer-1', validInput),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.code === 'MSG-48' &&
          err.field === 'sheetMusicId' &&
          err.message === messages.SHEET_MUSIC_UNAVAILABLE
      );
    });

    it('báo lỗi 409 MSG-08 khi loại bài SOLO hoặc ENSEMBLE đã tồn tại trong lớp (assertKindAvailable)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
      // Lớp đã có bài SOLO
      mock.method(AssignmentRepository, 'existsKindInClass', async () => true);

      await assert.rejects(
        AssignmentService.createAssignment('lecturer-1', { ...validInput, kind: 'SOLO' }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08' &&
          err.field === 'kind' &&
          err.message === messages.KIND_TAKEN('SOLO')
      );
    });

    describe('Giá trị biên (Boundary cases)', () => {
      it('cho phép không chọn bản nhạc (sheetMusicId = null)', async () => {
        mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
        mock.method(AssignmentRepository, 'existsKindInClass', async () => false);
        mock.method(AssignmentRepository, 'createAssignment', async () => ({ id: 'asg-no-sheet' }));
        mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});

        const noSheetRecord = createMockAssignmentRecord({
          id: 'asg-no-sheet',
          currentVersion: { ...createMockAssignmentRecord().currentVersion!, sheetMusicId: null, sheetMusic: null }
        });
        mock.method(AssignmentRepository, 'findById', async () => noSheetRecord);

        const result = await AssignmentService.createAssignment('lecturer-1', { ...validInput, sheetMusicId: null });
        assert.equal(result.sheetMusic, null);
      });

      it('loại bài OTHER và BONUS cho phép tạo nhiều bài trong cùng lớp', async () => {
        mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
        mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
        const existsKindMock = mock.method(AssignmentRepository, 'existsKindInClass', async () => true);
        mock.method(AssignmentRepository, 'createAssignment', async () => ({ id: 'asg-other' }));
        mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});
        mock.method(AssignmentRepository, 'findById', async () => createMockAssignmentRecord());

        await assert.doesNotReject(AssignmentService.createAssignment('lecturer-1', { ...validInput, kind: 'OTHER' }));
        await assert.doesNotReject(AssignmentService.createAssignment('lecturer-1', { ...validInput, kind: 'BONUS' }));
        // Không kiểm tra singleKinds đối với OTHER và BONUS
        assert.equal(existsKindMock.mock.callCount(), 0);
      });

      it('giá trị biên BPM: biên tối thiểu 1 và tối đa 300, hoặc null', async () => {
        mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
        mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
        mock.method(AssignmentRepository, 'existsKindInClass', async () => false);
        mock.method(AssignmentRepository, 'createAssignment', async () => ({ id: 'asg-bpm' }));
        mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});

        const bpmRecord = createMockAssignmentRecord({
          currentVersion: { ...createMockAssignmentRecord().currentVersion!, requiredBpm: 300 }
        });
        mock.method(AssignmentRepository, 'findById', async () => bpmRecord);

        const result = await AssignmentService.createAssignment('lecturer-1', { ...validInput, requiredBpm: 300 });
        assert.equal(result.requiredBpm, 300);
      });

      it('giá trị biên maxSubmissions: null (không giới hạn lượt nộp)', async () => {
        mock.method(ClassAccessService, 'assertOwnedClass', async () => mockClassRecord);
        mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
        mock.method(AssignmentRepository, 'existsKindInClass', async () => false);
        mock.method(AssignmentRepository, 'createAssignment', async () => ({ id: 'asg-unlimited' }));
        mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});

        const unlimitedRecord = createMockAssignmentRecord({ maxSubmissions: null });
        mock.method(AssignmentRepository, 'findById', async () => unlimitedRecord);

        const result = await AssignmentService.createAssignment('lecturer-1', { ...validInput, maxSubmissions: null });
        assert.equal(result.maxSubmissions, null);
      });
    });
  });

  describe('updateAssignment (Chỉnh sửa, quản lý phiên bản & BPM)', () => {
    const updateInput: Backend.AssignmentContentInput = {
      title: 'Tiêu đề mới v2',
      description: 'Mô tả cập nhật',
      kind: 'OTHER',
      sheetMusicId: 'sheet-1',
      requiredBpm: 90,
      maxSubmissions: 5
    };

    it('không thay đổi gì: giữ nguyên version và KHÔNG gửi thông báo', async () => {
      const currentRecord = createMockAssignmentRecord();
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => currentRecord);
      mock.method(AssignmentRepository, 'findById', async () => currentRecord);

      const createVersionMock = mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      // Input hoàn toàn khớp với currentVersion hiện tại
      const identicalInput: Backend.AssignmentContentInput = {
        title: currentRecord.currentVersion!.title,
        description: currentRecord.currentVersion!.description,
        kind: currentRecord.currentVersion!.kind,
        sheetMusicId: currentRecord.currentVersion!.sheetMusicId,
        requiredBpm: currentRecord.currentVersion!.requiredBpm,
        maxSubmissions: currentRecord.maxSubmissions
      };

      const result = await AssignmentService.updateAssignment('asg-1', 'lecturer-1', identicalInput);

      assert.equal(createVersionMock.mock.callCount(), 0);
      assert.equal(notifyMock.mock.callCount(), 0);
      assert.equal(result.version, 1);
    });

    it('có thay đổi trên bài tập đã xuất bản (PUBLISHED): tạo version mới (v2) và gửi thông báo cập nhật', async () => {
      const publishedRecord = createMockAssignmentRecord({ status: 'PUBLISHED' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => publishedRecord);
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
      mock.method(AssignmentRepository, 'existsKindInClass', async () => false);
      mock.method(AssignmentRepository, 'findMaxVersion', async () => 1);

      const createVersionMock = mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});
      mock.method(MemberRepository, 'findActiveMemberIds', async () => ['student-1']);
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      const updatedRecord = createMockAssignmentRecord({
        status: 'PUBLISHED',
        currentVersion: {
          ...publishedRecord.currentVersion!,
          version: 2,
          title: 'Tiêu đề mới v2',
          requiredBpm: 90
        }
      });
      mock.method(AssignmentRepository, 'findById', async () => updatedRecord);

      const result = await AssignmentService.updateAssignment('asg-1', 'lecturer-1', updateInput);

      assert.equal(createVersionMock.mock.callCount(), 1);
      assert.equal(createVersionMock.mock.calls[0].arguments[1], 2); // version 2 = 1 + 1
      assert.equal(notifyMock.mock.callCount(), 1);
      assert.equal(notifyMock.mock.calls[0].arguments[2].title, notifications.UPDATED_TITLE);
      assert.equal(result.version, 2);
    });

    it('có thay đổi trên bài tập nháp (DRAFT): tạo version mới nhưng KHÔNG gửi thông báo', async () => {
      const draftRecord = createMockAssignmentRecord({ status: 'DRAFT' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => draftRecord);
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
      mock.method(AssignmentRepository, 'existsKindInClass', async () => false);
      mock.method(AssignmentRepository, 'findMaxVersion', async () => 1);
      mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      const updatedRecord = createMockAssignmentRecord({
        status: 'DRAFT',
        currentVersion: { ...draftRecord.currentVersion!, version: 2 }
      });
      mock.method(AssignmentRepository, 'findById', async () => updatedRecord);

      await AssignmentService.updateAssignment('asg-1', 'lecturer-1', updateInput);
      assert.equal(notifyMock.mock.callCount(), 0);
    });

    it('báo lỗi 409 MSG-08 khi đổi loại bài sang SOLO đã tồn tại ở bài tập khác trong lớp', async () => {
      const currentRecord = createMockAssignmentRecord({ currentVersion: { ...createMockAssignmentRecord().currentVersion!, kind: 'OTHER' } });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => currentRecord);
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
      // existsKindInClass trả về true khi kiểm tra SOLO
      mock.method(AssignmentRepository, 'existsKindInClass', async () => true);

      await assert.rejects(
        AssignmentService.updateAssignment('asg-1', 'lecturer-1', { ...updateInput, kind: 'SOLO' }),
        (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'MSG-08'
      );
    });

    it('giá trị biên: giữ nguyên kind = SOLO khi sửa thì không bị báo lỗi trùng với chính nó (excludeAssignmentId)', async () => {
      const soloRecord = createMockAssignmentRecord({
        currentVersion: { ...createMockAssignmentRecord().currentVersion!, kind: 'SOLO' }
      });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => soloRecord);
      mock.method(AssignmentRepository, 'isSheetMusicSelectable', async () => true);
      mock.method(AssignmentRepository, 'findMaxVersion', async () => 1);
      mock.method(AssignmentRepository, 'createVersionAndMakeCurrent', async () => {});
      mock.method(AssignmentRepository, 'findById', async () => soloRecord);

      const existsKindMock = mock.method(AssignmentRepository, 'existsKindInClass', async (_c: string, _k: string, excludeId?: string) => {
        if (excludeId === 'asg-1') return false;
        return true;
      });

      await assert.doesNotReject(
        AssignmentService.updateAssignment('asg-1', 'lecturer-1', { ...updateInput, kind: 'SOLO' })
      );
      assert.equal(existsKindMock.mock.calls[0].arguments[2], 'asg-1');
    });
  });

  describe('publishAssignment (Chuyển trạng thái sang PUBLISHED)', () => {
    it('đăng bài tập nháp thành công và gửi thông báo tới học sinh', async () => {
      const draftRecord = createMockAssignmentRecord({ status: 'DRAFT' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => draftRecord);
      mock.method(AssignmentRepository, 'updateAssignment', async () => {});
      mock.method(MemberRepository, 'findActiveMemberIds', async () => ['student-1']);
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      const publishedRecord = createMockAssignmentRecord({ status: 'PUBLISHED', publishedAt: new Date() });
      mock.method(AssignmentRepository, 'findById', async () => publishedRecord);

      const result = await AssignmentService.publishAssignment('asg-1', 'lecturer-1');

      assert.equal(notifyMock.mock.callCount(), 1);
      assert.equal(notifyMock.mock.calls[0].arguments[2].title, notifications.PUBLISHED_TITLE);
      assert.equal(result.status, 'PUBLISHED');
    });

    it('giá trị biên: ném 409 MSG-08 khi bài tập không ở trạng thái DRAFT (ví dụ đã PUBLISHED hoặc CLOSED)', async () => {
      const publishedRecord = createMockAssignmentRecord({ status: 'PUBLISHED' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => publishedRecord);

      await assert.rejects(
        AssignmentService.publishAssignment('asg-1', 'lecturer-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'MSG-08'
      );
    });
  });

  describe('closeAssignment (Đóng bài tập)', () => {
    it('đóng bài tập đang xuất bản (PUBLISHED -> CLOSED) và KHÔNG gửi thông báo', async () => {
      const publishedRecord = createMockAssignmentRecord({ status: 'PUBLISHED' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => publishedRecord);
      mock.method(AssignmentRepository, 'updateAssignment', async () => {});
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      const closedRecord = createMockAssignmentRecord({ status: 'CLOSED', closedAt: new Date() });
      mock.method(AssignmentRepository, 'findById', async () => closedRecord);

      const result = await AssignmentService.closeAssignment('asg-1', 'lecturer-1');

      assert.equal(notifyMock.mock.callCount(), 0); // đóng bài không thông báo
      assert.equal(result.status, 'CLOSED');
    });

    it('giá trị biên: ném 409 MSG-08 khi đóng bài tập đang ở trạng thái DRAFT hoặc đã CLOSED', async () => {
      const draftRecord = createMockAssignmentRecord({ status: 'DRAFT' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => draftRecord);

      await assert.rejects(
        AssignmentService.closeAssignment('asg-1', 'lecturer-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'MSG-08'
      );
    });
  });

  describe('reopenAssignment (Mở lại bài tập đã đóng)', () => {
    it('mở lại bài tập (CLOSED -> PUBLISHED) và gửi thông báo tới học sinh', async () => {
      const closedRecord = createMockAssignmentRecord({ status: 'CLOSED', closedAt: new Date() });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => closedRecord);
      mock.method(AssignmentRepository, 'updateAssignment', async () => {});
      mock.method(MemberRepository, 'findActiveMemberIds', async () => ['student-1']);
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      const reopenedRecord = createMockAssignmentRecord({ status: 'PUBLISHED', closedAt: null });
      mock.method(AssignmentRepository, 'findById', async () => reopenedRecord);

      const result = await AssignmentService.reopenAssignment('asg-1', 'lecturer-1');

      assert.equal(notifyMock.mock.callCount(), 1);
      assert.equal(notifyMock.mock.calls[0].arguments[2].title, notifications.REOPENED_TITLE);
      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.closedAt, null);
    });

    it('giá trị biên: ném 409 MSG-08 khi mở lại bài tập đang là DRAFT hoặc đang PUBLISHED', async () => {
      const draftRecord = createMockAssignmentRecord({ status: 'DRAFT' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => draftRecord);

      await assert.rejects(
        AssignmentService.reopenAssignment('asg-1', 'lecturer-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'MSG-08'
      );
    });
  });

  describe('deleteAssignment (Xóa mềm bài tập)', () => {
    it('xóa mềm bài tập thành công (gán deletedAt và ghi audit log)', async () => {
      const record = createMockAssignmentRecord();
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => record);
      const updateMock = mock.method(AssignmentRepository, 'updateAssignment', async () => {});

      await AssignmentService.deleteAssignment('asg-1', 'lecturer-1');
      assert.equal(updateMock.mock.callCount(), 1);
      assert.ok(updateMock.mock.calls[0].arguments[1].deletedAt);
    });

    it('báo lỗi 404 khi bài tập đã bị xóa mềm trước đó', async () => {
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => {
        throw AppError.notFound(messages.ASSIGNMENT_NOT_FOUND);
      });

      await assert.rejects(
        AssignmentService.deleteAssignment('already-deleted-id', 'lecturer-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });
  });

  describe('isUnchanged', () => {
    it('trả về true khi tất cả các trường dữ liệu trùng khớp hoàn toàn', () => {
      const record = createMockAssignmentRecord();
      const input: Backend.AssignmentContentInput = {
        title: record.currentVersion!.title,
        description: record.currentVersion!.description,
        kind: record.currentVersion!.kind,
        sheetMusicId: record.currentVersion!.sheetMusicId,
        requiredBpm: record.currentVersion!.requiredBpm,
        maxSubmissions: record.maxSubmissions
      };
      assert.equal(AssignmentService.isUnchanged(record, input), true);
    });

    it('giá trị biên: nhận diện thay đổi khi title, kind, bpm, sheetMusicId hoặc maxSubmissions khác', () => {
      const record = createMockAssignmentRecord();
      const baseInput: Backend.AssignmentContentInput = {
        title: record.currentVersion!.title,
        description: record.currentVersion!.description,
        kind: record.currentVersion!.kind,
        sheetMusicId: record.currentVersion!.sheetMusicId,
        requiredBpm: record.currentVersion!.requiredBpm,
        maxSubmissions: record.maxSubmissions
      };

      assert.equal(AssignmentService.isUnchanged(record, { ...baseInput, title: 'Tiêu đề khác' }), false);
      assert.equal(AssignmentService.isUnchanged(record, { ...baseInput, requiredBpm: 120 }), false);
      assert.equal(AssignmentService.isUnchanged(record, { ...baseInput, sheetMusicId: 'other-sheet' }), false);
      assert.equal(AssignmentService.isUnchanged(record, { ...baseInput, maxSubmissions: 10 }), false);
      assert.equal(AssignmentService.isUnchanged(record, { ...baseInput, kind: 'SOLO' }), false);
    });

    it('giá trị biên: trả về false khi currentVersion là null', () => {
      const record = createMockAssignmentRecord({ currentVersion: null });
      assert.equal(
        AssignmentService.isUnchanged(record, { title: 'T', kind: 'OTHER' }),
        false
      );
    });
  });

  describe('notifyMembers (Gửi thông báo tới lớp học)', () => {
    it('giá trị biên: lớp học chưa có sinh viên hoạt động nào (memberIds rỗng)', async () => {
      mock.method(MemberRepository, 'findActiveMemberIds', async () => []);
      const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

      await AssignmentService.notifyMembers('lecturer-1', 'class-1', 'TRN101.1', 'Bài 1', 'asg-1', 'Tiêu đề', fakeTx);
      assert.equal(notifyMock.mock.callCount(), 1);
      assert.deepEqual(notifyMock.mock.calls[0].arguments[1], []);
    });
  });
});
