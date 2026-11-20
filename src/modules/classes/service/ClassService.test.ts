import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import AssignmentRepository from '../../assignments/repository/AssignmentRepository.ts';
import AssignmentService from '../../assignments/service/AssignmentService.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import RoadmapRepository from '../../roadmaps/repository/RoadmapRepository.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassDTO from '../dto/ClassDTO.ts';
import ClassLecturerRepository from '../repository/ClassLecturerRepository.ts';
import ClassRepository from '../repository/ClassRepository.ts';
import ClassAccessService from './ClassAccessService.ts';
import ClassCopyPolicyService from './ClassCopyPolicyService.ts';
import ClassLecturerService from './ClassLecturerService.ts';
import ClassService from './ClassService.ts';

const messages = ClassConstant.messages;

function createMockClass(overrides: Partial<Backend.ClassRecord> = {}): Backend.ClassRecord {
  return {
    id: 'class-1',
    name: 'TRN101.1',
    cohort: 'FA26',
    description: 'Lớp đàn tranh căn bản',
    instrumentId: 'inst-tranh',
    ownerId: 'lecturer-1',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-15T00:00:00.000Z'),
    status: 'ACTIVE',
    endedAt: null,
    roadmapId: 'roadmap-v1',
    createdAt: new Date('2026-08-15T00:00:00.000Z'),
    instrument: { id: 'inst-tranh', name: 'Đàn tranh' },
    owner: { id: 'lecturer-1', username: 'lecturer1', email: 'lecturer1@fpt.edu.vn' },
    coLecturers: [
      {
        lecturerId: 'lecturer-2',
        lecturer: { id: 'lecturer-2', username: 'lecturer2', email: 'lecturer2@fpt.edu.vn' }
      }
    ],
    _count: { members: 20 },
    ...overrides
  };
}

const mockSemesters: Backend.Semester[] = [
  { name: 'SU26', startDate: '2026-05-01', endDate: '2026-08-20' },
  { name: 'FA26', startDate: '2026-09-01', endDate: '2026-12-20' },
  { name: 'SP27', startDate: '2027-01-05', endDate: '2027-04-20' }
];

describe('ClassService', () => {
  const fakeTx = {} as any;
  const originalTransaction = PrismaClientProvider.instance.$transaction;

  beforeEach(() => {
    // Default transaction pass-through mock
    (PrismaClientProvider.instance as any).$transaction = async (arg: any) => {
      if (typeof arg === 'function') {
        return arg(fakeTx);
      }
      return Promise.all(arg);
    };

    // Default AuditLogger mock
    mock.method(AuditLogger, 'record', async () => {});
  });

  afterEach(() => {
    (PrismaClientProvider.instance as any).$transaction = originalTransaction;
    mock.restoreAll();
  });

  describe('listOwnClasses (Lecturer classes list & owner rule)', () => {
    it('trả về danh sách lớp do giảng viên phụ trách kèm bộ đếm và danh sách học kỳ', async () => {
      const classRecord = createMockClass();
      mock.method(ClassRepository, 'findClasses', async () => ({
        classes: [classRecord],
        total: 1
      }));
      mock.method(ClassRepository, 'countActiveClasses', async () => 1);
      mock.method(ClassRepository, 'findCohorts', async () => ['FA26']);

      const query: Backend.ClassListQuery = { status: 'ACTIVE', page: 1, limit: 10 };
      const result = await ClassService.listOwnClasses('lecturer-1', query);

      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].id, 'class-1');
      assert.equal(result.items[0].name, 'TRN101.1');
      assert.equal(result.items[0].isPrimaryLecturer, true);
      assert.equal(result.activeCount, 1);
      assert.deepEqual(result.cohorts, ['FA26']);
      assert.equal(result.pagination.total, 1);
    });

    it('gắn cờ isPrimaryLecturer = false khi người xem là giảng viên cùng dạy', async () => {
      const classRecord = createMockClass({ ownerId: 'lecturer-other' });
      mock.method(ClassRepository, 'findClasses', async () => ({
        classes: [classRecord],
        total: 1
      }));
      mock.method(ClassRepository, 'countActiveClasses', async () => 1);
      mock.method(ClassRepository, 'findCohorts', async () => ['FA26']);

      const result = await ClassService.listOwnClasses('lecturer-2', { status: 'ALL', page: 1, limit: 10 });
      assert.equal(result.items[0].isPrimaryLecturer, false);
    });
  });

  describe('getClassDetail (Owner rule & Ended classes read-only view)', () => {
    it('trả về chi tiết lớp học khi giảng viên phụ trách lớp', async () => {
      const classRecord = createMockClass();
      mock.method(ClassAccessService, 'assertOwnedClass', async () => classRecord);

      const result = await ClassService.getClassDetail('class-1', 'lecturer-1');
      assert.equal(result.id, 'class-1');
      assert.equal(result.name, 'TRN101.1');
      assert.equal(result.isReadOnly, false);
    });

    it('báo lỗi 404 khi người gọi không sở hữu hoặc không phụ trách lớp (owner rule)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.notFound(messages.CLASS_NOT_FOUND);
      });

      await assert.rejects(
        ClassService.getClassDetail('class-1', 'unauthorized-lecturer'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === messages.CLASS_NOT_FOUND
      );
    });

    it('trả về isReadOnly = true khi lớp học đã kết thúc', async () => {
      const endedClass = createMockClass({
        status: 'ENDED',
        endedAt: new Date('2026-10-15T12:00:00.000Z')
      });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => endedClass);

      const result = await ClassService.getClassDetail('class-1', 'lecturer-1');
      assert.equal(result.isReadOnly, true);
      assert.equal(result.status, 'ENDED');
      assert.ok(result.endedAt);
    });
  });

  describe('getCopySource', () => {
    it('kiểm tra quyền sở hữu lớp nguồn và lấy danh sách bài tập sao chép được', async () => {
      const classRecord = createMockClass();
      const mockAssignments: any[] = [
        {
          id: 'asg-1',
          status: 'PUBLISHED',
          maxSubmissions: 3,
          currentVersion: {
            title: 'Bài độc tấu số 1',
            kind: 'SOLO',
            description: 'Mô tả',
            sheetMusic: {
              id: 'sheet-1',
              name: 'Lưu thủy',
              piece: { id: 'piece-1', title: 'Lưu thủy hành vân', bpm: 80, isPublic: true },
              mediaFile: { id: 'file-1' }
            },
            requiredBpm: 80
          }
        }
      ];

      const assertOwned = mock.method(ClassAccessService, 'assertOwnedClass', async () => classRecord);
      const findCopyable = mock.method(AssignmentRepository, 'findCopyableAssignments', async () => mockAssignments);

      const result = await ClassService.getCopySource('class-1', 'lecturer-1');
      assert.equal(assertOwned.mock.callCount(), 1);
      assert.equal(findCopyable.mock.callCount(), 1);
      assert.equal(result.id, 'class-1');
      assert.equal(result.assignments.length, 1);
      assert.equal(result.assignments[0].title, 'Bài độc tấu số 1');
    });
  });

  describe('Current semester (listSemesters & pickDefaultSemester & findSemester)', () => {
    it('pickDefaultSemester: chọn học kỳ chứa ngày hôm nay', () => {
      // 2026-10-10 belongs to FA26 (2026-09-01 -> 2026-12-20)
      const now = new Date('2026-10-10T10:00:00+07:00');
      const selected = ClassService.pickDefaultSemester(mockSemesters, now);
      assert.equal(selected?.name, 'FA26');
    });

    it('pickDefaultSemester: chọn học kỳ có ngày kết thúc gần nhất khi hôm nay không thuộc học kỳ nào', () => {
      // 2026-08-25 is between SU26 (ends 2026-08-20) and FA26 (starts 2026-09-01)
      const now = new Date('2026-08-25T10:00:00+07:00');
      const selected = ClassService.pickDefaultSemester(mockSemesters, now);
      // SU26 endDate is 2026-08-20 (diff: 5 days) vs FA26 endDate 2026-12-20 (diff: months)
      assert.equal(selected?.name, 'SU26');
    });

    it('pickDefaultSemester: trả về null khi danh sách học kỳ rỗng', () => {
      assert.equal(ClassService.pickDefaultSemester([]), null);
    });

    it('listSemesters: trả về danh sách học kỳ và defaultName tương ứng', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

      const now = new Date('2026-10-10T10:00:00+07:00');
      const result = await ClassService.listSemesters(now);
      assert.equal(result.items.length, 3);
      assert.equal(result.defaultName, 'FA26');
    });

    it('findSemester: tìm thấy học kỳ không phân biệt chữ hoa/thường và khoảng trắng', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

      const semester = await ClassService.findSemester('  fa26  ');
      assert.equal(semester.name, 'FA26');
      assert.equal(semester.startDate, '2026-09-01');
    });

    it('findSemester: báo lỗi 400 SEMESTER_NOT_FOUND khi học kỳ không tồn tại', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

      await assert.rejects(
        ClassService.findSemester('UNKNOWN_SEM'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.field === 'cohort' &&
          err.message === messages.SEMESTER_NOT_FOUND
      );
    });
  });

  describe('createClass (Lecturer classes: create & unique class code per semester)', () => {
    const validInput: Backend.CreateClassInput = {
      name: 'TRN101.1',
      cohort: 'FA26',
      instrumentId: 'inst-tranh',
      description: 'Lớp mới',
      coLecturerIds: ['lecturer-co'],
      assignments: []
    };

    it('tạo lớp học thành công và ghi nhận nhật ký audit', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-tranh',
        name: 'Đàn tranh',
        isActive: true
      }));
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => null);
      mock.method(ClassLecturerService, 'assertAssignableLecturers', async () => {});
      mock.method(RoadmapRepository, 'findLatestRoadmapId', async () => 'roadmap-v2');

      const createdRecord = createMockClass({
        name: 'TRN101.1',
        cohort: 'FA26',
        roadmapId: 'roadmap-v2'
      });
      mock.method(ClassRepository, 'createClass', async () => createdRecord);
      mock.method(ClassLecturerRepository, 'createMany', async () => {});
      mock.method(AssignmentService, 'createManyInTransaction', async () => {});
      mock.method(ClassRepository, 'findClassById', async () => createdRecord);

      const result = await ClassService.createClass('lecturer-1', validInput);

      assert.equal(result.name, 'TRN101.1');
      assert.equal(result.cohort, 'FA26');
      assert.equal(result.isReadOnly, false);
      assert.equal(result.status, 'ACTIVE');
    });

    it('từ chối khi học kỳ không tồn tại', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

      await assert.rejects(
        ClassService.createClass('lecturer-1', { ...validInput, cohort: 'INVALID_COHORT' }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.field === 'cohort' &&
          err.message === messages.SEMESTER_NOT_FOUND
      );
    });

    it('từ chối khi môn học/nhạc cụ không còn hoạt động', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-tranh',
        name: 'Đàn tranh',
        isActive: false
      }));

      await assert.rejects(
        ClassService.createClass('lecturer-1', validInput),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.field === 'instrumentId' &&
          err.message === messages.INSTRUMENT_UNAVAILABLE
      );
    });

    it('từ chối khi mã lớp đã tồn tại trong cùng học kỳ (class code unique per semester - MSG-05)', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-tranh',
        name: 'Đàn tranh',
        isActive: true
      }));
      // Existing class found in FA26
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => ({ id: 'existing-class-id' }));

      await assert.rejects(
        ClassService.createClass('lecturer-1', validInput),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-05' &&
          err.field === 'name' &&
          err.message === messages.DUPLICATE_CLASS_NAME
      );
    });

    it('bắt lỗi vi phạm unique index từ cơ sở dữ liệu (P2002) và chuyển thành MSG-05', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-tranh',
        name: 'Đàn tranh',
        isActive: true
      }));
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => null);
      mock.method(ClassLecturerService, 'assertAssignableLecturers', async () => {});
      mock.method(RoadmapRepository, 'findLatestRoadmapId', async () => 'roadmap-v2');

      // Database throws unique violation during transaction
      mock.method(ClassRepository, 'createClass', async () => {
        const p2002 = new Error('Unique constraint failed') as any;
        p2002.code = 'P2002';
        throw p2002;
      });

      await assert.rejects(
        ClassService.createClass('lecturer-1', validInput),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-05' &&
          err.field === 'name' &&
          err.message === messages.DUPLICATE_CLASS_NAME
      );
    });

    it('kiểm tra quyền sở hữu lớp nguồn khi sao chép từ sourceClassId (owner rule)', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-tranh',
        name: 'Đàn tranh',
        isActive: true
      }));
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => null);
      mock.method(ClassLecturerService, 'assertAssignableLecturers', async () => {});

      // assertOwnedClass fails for sourceClassId
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.notFound(messages.CLASS_NOT_FOUND);
      });

      await assert.rejects(
        ClassService.createClass('lecturer-1', { ...validInput, sourceClassId: 'source-class-123' }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === messages.CLASS_NOT_FOUND
      );
    });

    it('từ chối khi danh sách bài tập sao chép không hợp lệ (assertCopyAssignmentsValid)', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-tranh',
        name: 'Đàn tranh',
        isActive: true
      }));
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => null);
      mock.method(ClassLecturerService, 'assertAssignableLecturers', async () => {});

      // Mock ClassCopyPolicyService to return error
      mock.method(ClassCopyPolicyService, 'findAssignmentErrors', () => [
        { field: 'assignments.0.kind', code: 'MSG-08', message: 'Nhiều hơn một bài độc tấu' }
      ]);

      const inputWithAssignments: Backend.CreateClassInput = {
        ...validInput,
        assignments: [
          { title: 'Bài 1', kind: 'SOLO', status: 'DRAFT' } as any,
          { title: 'Bài 2', kind: 'SOLO', status: 'DRAFT' } as any
        ]
      };

      await assert.rejects(
        ClassService.createClass('lecturer-1', inputWithAssignments),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.code === 'MSG-08' &&
          err.message === 'Nhiều hơn một bài độc tấu'
      );
    });
  });

  describe('updateClass (Lecturer classes: edit, owner rule, ended read-only, locked fields)', () => {
    it('báo lỗi 409 MSG-08 khi cố gắng chỉnh sửa lớp đã kết thúc (ended classes are read-only)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.conflict(messages.CLASS_FINISHED, { code: 'MSG-08' });
      });

      await assert.rejects(
        ClassService.updateClass('class-1', 'lecturer-1', { description: 'Thay đổi mô tả' }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08' &&
          err.message === messages.CLASS_FINISHED
      );
    });

    it('báo lỗi 404 khi người gọi không sở hữu lớp học cần cập nhật (owner rule)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.notFound(messages.CLASS_NOT_FOUND);
      });

      await assert.rejects(
        ClassService.updateClass('class-1', 'unauthorized-user', { description: 'Sửa' }),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });

    it('trả về thông tin lớp không đổi nếu input không có thay đổi nào', async () => {
      const currentClass = createMockClass();
      mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);

      const updateClassMock = mock.method(ClassRepository, 'updateClass', async () => currentClass);

      const result = await ClassService.updateClass('class-1', 'lecturer-1', {});
      assert.equal(result.id, 'class-1');
      assert.equal(updateClassMock.mock.callCount(), 0);
    });

    it('từ chối đổi môn học (instrumentId) khi lớp học đã bắt đầu (GBR-36, MSG-08)', async () => {
      // Class startDate is 2026-09-01; now is 2026-09-05 (started)
      const currentClass = createMockClass({ startDate: new Date('2026-09-01T00:00:00.000Z') });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);

      const now = new Date('2026-09-05T08:00:00+07:00');
      await assert.rejects(
        ClassService.updateClass('class-1', 'lecturer-1', { instrumentId: 'inst-nhi' }, now),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08' &&
          err.field === 'instrumentId' &&
          err.message === messages.INSTRUMENT_LOCKED
      );
    });

    it('từ chối đổi học kỳ (cohort) khi lớp học đã bắt đầu (GBR-36, MSG-08)', async () => {
      const currentClass = createMockClass({ startDate: new Date('2026-09-01T00:00:00.000Z') });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);

      const now = new Date('2026-09-05T08:00:00+07:00');
      await assert.rejects(
        ClassService.updateClass('class-1', 'lecturer-1', { cohort: 'SP27' }, now),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08' &&
          err.field === 'cohort' &&
          err.message === messages.SEMESTER_LOCKED
      );
    });

    it('cho phép đổi môn học khi lớp chưa bắt đầu (tái gán lộ trình mới nhất)', async () => {
      // startDate is 2026-09-01, now is 2026-08-20 (not started)
      const currentClass = createMockClass({
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        instrumentId: 'inst-tranh'
      });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-bau',
        name: 'Đàn bầu',
        isActive: true
      }));
      mock.method(RoadmapRepository, 'findLatestRoadmapId', async () => 'roadmap-bau-v1');

      const updatedRecord = createMockClass({
        ...currentClass,
        instrumentId: 'inst-bau',
        roadmapId: 'roadmap-bau-v1'
      });
      const updateMock = mock.method(ClassRepository, 'updateClass', async () => updatedRecord);

      const now = new Date('2026-08-20T08:00:00+07:00');
      const result = await ClassService.updateClass('class-1', 'lecturer-1', { instrumentId: 'inst-bau' }, now);

      assert.equal(updateMock.mock.callCount(), 1);
      assert.deepEqual(updateMock.mock.calls[0].arguments[1], {
        instrumentId: 'inst-bau',
        roadmapId: 'roadmap-bau-v1'
      });
      assert.equal(result.id, 'class-1');
    });

    it('cho phép đổi học kỳ khi lớp chưa bắt đầu và đồng bộ thời hạn bài tập khi endDate đổi', async () => {
      const currentClass = createMockClass({
        cohort: 'FA26',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-10-15T00:00:00.000Z')
      });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => null);

      const updatedRecord = createMockClass({
        ...currentClass,
        cohort: 'SP27',
        startDate: new Date('2027-01-05T00:00:00.000Z'),
        endDate: new Date('2027-04-20T00:00:00.000Z')
      });
      mock.method(ClassRepository, 'updateClass', async () => updatedRecord);
      const syncMock = mock.method(AssignmentRepository, 'syncDeadlines', async () => {});

      const now = new Date('2026-08-20T08:00:00+07:00');
      const result = await ClassService.updateClass('class-1', 'lecturer-1', { cohort: 'SP27' }, now);

      assert.equal(syncMock.mock.callCount(), 1);
      assert.equal(result.cohort, 'SP27');
    });

    it('báo lỗi 409 MSG-05 khi đổi tên lớp bị trùng với lớp khác trong cùng học kỳ', async () => {
      const currentClass = createMockClass({ name: 'TRN101.1', cohort: 'FA26' });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);
      // Duplicate name check in repository finds existing class
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => ({ id: 'other-class-id' }));

      const now = new Date('2026-08-20T08:00:00+07:00');
      await assert.rejects(
        ClassService.updateClass('class-1', 'lecturer-1', { name: 'TRN101.2' }, now),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-05' &&
          err.message === messages.DUPLICATE_CLASS_NAME
      );
    });

    it('cho phép đổi mô tả lớp học', async () => {
      const currentClass = createMockClass({ description: 'Mô tả cũ' });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);

      const updatedRecord = createMockClass({ ...currentClass, description: 'Mô tả mới' });
      mock.method(ClassRepository, 'updateClass', async () => updatedRecord);

      const result = await ClassService.updateClass('class-1', 'lecturer-1', { description: 'Mô tả mới' });
      assert.equal(result.description, 'Mô tả mới');
    });
  });

  describe('endClass (Lecturer classes: end, owner rule, ended read-only)', () => {
    it('kết thúc lớp thành công, đóng bài tập đang mở và ghi audit log', async () => {
      const activeClass = createMockClass({ status: 'ACTIVE' });
      mock.method(ClassAccessService, 'assertOwnedClass', async () => activeClass);

      const endedRecord = createMockClass({
        ...activeClass,
        status: 'ENDED',
        endedAt: new Date('2026-10-20T10:00:00.000Z')
      });
      const markFinishedMock = mock.method(ClassRepository, 'markClassFinished', async () => endedRecord);
      const closeAssignmentsMock = mock.method(AssignmentService, 'closePublishedForClass', async () => {});

      const result = await ClassService.endClass('class-1', 'lecturer-1');

      assert.equal(markFinishedMock.mock.callCount(), 1);
      assert.equal(closeAssignmentsMock.mock.callCount(), 1);
      assert.equal(result.status, 'ENDED');
      assert.equal(result.isReadOnly, true);
    });

    it('báo lỗi 409 MSG-08 khi kết thúc một lớp đã kết thúc trước đó (read-only)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.conflict(messages.CLASS_FINISHED, { code: 'MSG-08' });
      });

      await assert.rejects(
        ClassService.endClass('class-1', 'lecturer-1'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08' &&
          err.message === messages.CLASS_FINISHED
      );
    });

    it('báo lỗi 404 khi người gọi không sở hữu hoặc không phụ trách lớp (owner rule)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => {
        throw AppError.notFound(messages.CLASS_NOT_FOUND);
      });

      await assert.rejects(
        ClassService.endClass('class-1', 'stranger-lecturer'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === messages.CLASS_NOT_FOUND
      );
    });
  });

  describe('assertInstrumentActive', () => {
    it('báo lỗi 400 INSTRUMENT_UNAVAILABLE khi không tìm thấy nhạc cụ', async () => {
      mock.method(ClassRepository, 'findInstrumentById', async () => null);

      await assert.rejects(
        ClassService.assertInstrumentActive('non-existent-inst'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.field === 'instrumentId' &&
          err.message === messages.INSTRUMENT_UNAVAILABLE
      );
    });

    it('báo lỗi 400 INSTRUMENT_UNAVAILABLE khi nhạc cụ đang ở trạng thái không hoạt động', async () => {
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-1',
        name: 'Đàn bầu',
        isActive: false
      }));

      await assert.rejects(
        ClassService.assertInstrumentActive('inst-1'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.field === 'instrumentId' &&
          err.message === messages.INSTRUMENT_UNAVAILABLE
      );
    });

    it('hoàn thành không ném lỗi khi nhạc cụ đang hoạt động', async () => {
      mock.method(ClassRepository, 'findInstrumentById', async () => ({
        id: 'inst-1',
        name: 'Đàn tranh',
        isActive: true
      }));

      await assert.doesNotReject(ClassService.assertInstrumentActive('inst-1'));
    });
  });

  describe('assertUniqueName & runUniqueGuarded', () => {
    it('assertUniqueName: báo lỗi 409 MSG-05 khi trùng tên lớp trong học kỳ', async () => {
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => ({ id: 'c-1' }));

      await assert.rejects(
        ClassService.assertUniqueName('FA26', 'TRN101.1'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-05' &&
          err.field === 'name' &&
          err.message === messages.DUPLICATE_CLASS_NAME
      );
    });

    it('assertUniqueName: hoàn thành không ném lỗi khi tên chưa tồn tại', async () => {
      mock.method(ClassRepository, 'findClassByCohortAndName', async () => null);

      await assert.doesNotReject(ClassService.assertUniqueName('FA26', 'TRN101.NEW'));
    });

    it('runUniqueGuarded: chuyển lỗi P2002 thành 409 MSG-05 DUPLICATE_CLASS_NAME', async () => {
      await assert.rejects(
        ClassService.runUniqueGuarded(async () => {
          const err = new Error('P2002 duplicate') as any;
          err.code = 'P2002';
          throw err;
        }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-05' &&
          err.message === messages.DUPLICATE_CLASS_NAME
      );
    });

    it('runUniqueGuarded: ném lại các lỗi khác không phải P2002', async () => {
      const customErr = new Error('Database connection failed');
      await assert.rejects(
        ClassService.runUniqueGuarded(async () => {
          throw customErr;
        }),
        (err: unknown) => err === customErr
      );
    });
  });

  describe('Giá trị biên (Boundary & Edge cases)', () => {
    describe('Khóa ngày bắt đầu theo múi giờ Việt Nam (TC-M03-016, GBR-36)', () => {
      const startDate = new Date('2026-09-01T00:00:00.000Z');

      it('trước 00:00:00 ngày bắt đầu 1 giây (23:59:59 UTC+7 ngày 31/08): lớp chưa bắt đầu, cho phép đổi môn học và học kỳ', async () => {
        const currentClass = createMockClass({
          startDate,
          instrumentId: 'inst-tranh',
          cohort: 'FA26'
        });
        mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);
        mock.method(ClassRepository, 'findInstrumentById', async () => ({ id: 'inst-bau', name: 'Đàn bầu', isActive: true }));
        mock.method(RoadmapRepository, 'findLatestRoadmapId', async () => 'roadmap-bau');
        mock.method(ClassRepository, 'updateClass', async () => currentClass);

        // 23:59:59 on 2026-08-31 in Vietnam time (UTC+7)
        const justBeforeStart = new Date('2026-08-31T23:59:59+07:00');
        await assert.doesNotReject(
          ClassService.updateClass('class-1', 'lecturer-1', { instrumentId: 'inst-bau' }, justBeforeStart)
        );
      });

      it('đúng 00:00:00 ngày bắt đầu (UTC+7 ngày 01/09): lớp đã bắt đầu, lập tức khóa đổi môn học và học kỳ (MSG-08)', async () => {
        const currentClass = createMockClass({ startDate });
        mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);

        // 00:00:00 on 2026-09-01 in Vietnam time (UTC+7)
        const exactStart = new Date('2026-09-01T00:00:00+07:00');

        await assert.rejects(
          ClassService.updateClass('class-1', 'lecturer-1', { instrumentId: 'inst-bau' }, exactStart),
          (err: unknown) =>
            err instanceof AppError &&
            err.statusCode === 409 &&
            err.code === 'MSG-08' &&
            err.field === 'instrumentId'
        );

        await assert.rejects(
          ClassService.updateClass('class-1', 'lecturer-1', { cohort: 'SP27' }, exactStart),
          (err: unknown) =>
            err instanceof AppError &&
            err.statusCode === 409 &&
            err.code === 'MSG-08' &&
            err.field === 'cohort'
        );
      });

      it('khi lớp đã bắt đầu: truyền instrumentId hoặc cohort trùng giá trị cũ không bị khóa và cho phép sửa description', async () => {
        const currentClass = createMockClass({
          startDate,
          instrumentId: 'inst-tranh',
          cohort: 'FA26',
          description: 'Mô tả cũ'
        });
        mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);

        const updatedRecord = createMockClass({ ...currentClass, description: 'Mô tả mới' });
        const updateMock = mock.method(ClassRepository, 'updateClass', async () => updatedRecord);

        const afterStart = new Date('2026-09-05T10:00:00+07:00');
        const result = await ClassService.updateClass(
          'class-1',
          'lecturer-1',
          {
            instrumentId: 'inst-tranh', // identical to current
            cohort: 'fa26',             // case-insensitive same cohort
            description: 'Mô tả mới'
          },
          afterStart
        );

        assert.equal(updateMock.mock.callCount(), 1);
        assert.equal(result.description, 'Mô tả mới');
      });
    });

    describe('Biên chọn học kỳ mặc định (pickDefaultSemester)', () => {
      it('đúng mốc 00:00:00 của ngày bắt đầu học kỳ: chọn chính xác học kỳ đó', () => {
        // FA26 startDate: 2026-09-01
        const boundaryStart = new Date('2026-09-01T00:00:00+07:00');
        const selected = ClassService.pickDefaultSemester(mockSemesters, boundaryStart);
        assert.equal(selected?.name, 'FA26');
      });

      it('đúng mốc 23:59:59 của ngày kết thúc học kỳ: chọn chính xác học kỳ đó', () => {
        // FA26 endDate: 2026-12-20
        const boundaryEnd = new Date('2026-12-20T23:59:59+07:00');
        const selected = ClassService.pickDefaultSemester(mockSemesters, boundaryEnd);
        assert.equal(selected?.name, 'FA26');
      });

      it('1 ngày sau khi học kỳ kết thúc: chọn học kỳ có ngày kết thúc gần nhất (vẫn là học kỳ vừa kết thúc)', () => {
        // 2026-12-21 (1 day after FA26 end, before SP27 start 2027-01-05)
        const dayAfterEnd = new Date('2026-12-21T00:00:00+07:00');
        const selected = ClassService.pickDefaultSemester(mockSemesters, dayAfterEnd);
        assert.equal(selected?.name, 'FA26');
      });

      it('chỉ có 1 học kỳ duy nhất: luôn trả về học kỳ đó dù ngày hiện tại cách xa nhiều năm', () => {
        const singleSemester: Backend.Semester[] = [
          { name: 'FA26', startDate: '2026-09-01', endDate: '2026-12-20' }
        ];
        const farFuture = new Date('2035-10-10T10:00:00+07:00');
        assert.equal(ClassService.pickDefaultSemester(singleSemester, farFuture)?.name, 'FA26');
      });
    });

    describe('Biên tìm kiếm học kỳ (findSemester)', () => {
      it('tìm thấy học kỳ khi input chứa khoảng trắng phức tạp (tab, xuống dòng, space)', async () => {
        mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

        const semester = await ClassService.findSemester('\t \n FA26 \r \n');
        assert.equal(semester.name, 'FA26');
      });

      it('báo lỗi 400 SEMESTER_NOT_FOUND khi input là chuỗi rỗng hoặc chỉ toàn khoảng trắng', async () => {
        mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

        await assert.rejects(
          ClassService.findSemester('   '),
          (err: unknown) =>
            err instanceof AppError &&
            err.statusCode === 400 &&
            err.field === 'cohort' &&
            err.message === messages.SEMESTER_NOT_FOUND
        );
      });
    });

    describe('Biên thay đổi mô tả và tên/kỳ học (buildClassChanges / updateClass)', () => {
      it('chuyển description từ có giá trị sang chuỗi rỗng (""): cập nhật thành null trong CSDL', async () => {
        const currentClass = createMockClass({ description: 'Mô tả hiện tại' });
        mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);

        const updatedRecord = createMockClass({ ...currentClass, description: null });
        const updateMock = mock.method(ClassRepository, 'updateClass', async () => updatedRecord);

        const result = await ClassService.updateClass('class-1', 'lecturer-1', { description: '' });
        assert.equal(updateMock.mock.callCount(), 1);
        assert.deepEqual(updateMock.mock.calls[0].arguments[1], { description: null });
        assert.equal(result.description, null);
      });

      it('chuyển description từ null sang chuỗi rỗng (""): không coi là có thay đổi (không ghi CSDL)', async () => {
        const currentClass = createMockClass({ description: null });
        mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);
        const updateMock = mock.method(ClassRepository, 'updateClass', async () => currentClass);

        const result = await ClassService.updateClass('class-1', 'lecturer-1', { description: '' });
        assert.equal(updateMock.mock.callCount(), 0);
        assert.equal(result.description, null);
      });

      it('giữ nguyên tên nhưng đổi học kỳ sang kỳ mới: kiểm tra tính duy nhất của tên trong học kỳ mới', async () => {
        const currentClass = createMockClass({
          name: 'TRN101.1',
          cohort: 'FA26',
          startDate: new Date('2026-09-01T00:00:00.000Z')
        });
        mock.method(ClassAccessService, 'assertOwnedClass', async () => currentClass);
        mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

        // Name TRN101.1 is already taken in SP27
        mock.method(ClassRepository, 'findClassByCohortAndName', async (cohort: string) => {
          if (cohort === 'SP27') return { id: 'other-class-in-sp27' };
          return null;
        });

        const beforeStart = new Date('2026-08-20T10:00:00+07:00');
        await assert.rejects(
          ClassService.updateClass('class-1', 'lecturer-1', { cohort: 'SP27' }, beforeStart),
          (err: unknown) =>
            err instanceof AppError &&
            err.statusCode === 409 &&
            err.code === 'MSG-05' &&
            err.message === messages.DUPLICATE_CLASS_NAME
        );
      });

      it('assertUniqueName: truyền excludedClassId trùng với ID lớp đang sửa thì không báo lỗi trùng', async () => {
        mock.method(ClassRepository, 'findClassByCohortAndName', async (_c: string, _n: string, excludedId?: string) => {
          if (excludedId === 'class-1') return null;
          return { id: 'class-1' };
        });

        await assert.doesNotReject(ClassService.assertUniqueName('FA26', 'TRN101.1', 'class-1'));
      });
    });
  });
});
