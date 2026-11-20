import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassRepository from '../repository/ClassRepository.ts';
import ClassAccessService from './ClassAccessService.ts';

function createMockClass(overrides: Partial<Backend.ClassRecord> = {}): Backend.ClassRecord {
  return {
    id: 'class-1',
    name: 'TRN101.1',
    cohort: 'FA26',
    description: 'Lớp đàn tranh',
    instrumentId: 'inst-1',
    ownerId: 'lecturer-primary',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-10-15T00:00:00.000Z'),
    status: 'ACTIVE',
    endedAt: null,
    roadmapId: 'roadmap-1',
    createdAt: new Date('2026-08-15T00:00:00.000Z'),
    instrument: { id: 'inst-1', name: 'Đàn tranh' },
    owner: { id: 'lecturer-primary', username: 'primary', email: 'primary@fpt.edu.vn' },
    coLecturers: [
      {
        lecturerId: 'lecturer-co',
        lecturer: { id: 'lecturer-co', username: 'co', email: 'co@fpt.edu.vn' }
      }
    ],
    _count: { members: 25 },
    ...overrides
  };
}

describe('ClassAccessService', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('isClassLecturer', () => {
    it('trả về true nếu người dùng là giảng viên chính (ownerId)', () => {
      const record = createMockClass({ ownerId: 'lecturer-1', coLecturers: [] });
      assert.equal(ClassAccessService.isClassLecturer(record, 'lecturer-1'), true);
    });

    it('trả về true nếu người dùng là giảng viên cùng dạy (coLecturer)', () => {
      const record = createMockClass({
        ownerId: 'lecturer-1',
        coLecturers: [{ lecturerId: 'lecturer-2', lecturer: { id: 'lecturer-2', username: 'co', email: 'co@fpt.edu.vn' } }]
      });
      assert.equal(ClassAccessService.isClassLecturer(record, 'lecturer-2'), true);
    });

    it('trả về false nếu người dùng không thuộc lớp học', () => {
      const record = createMockClass({ ownerId: 'lecturer-1', coLecturers: [] });
      assert.equal(ClassAccessService.isClassLecturer(record, 'lecturer-other'), false);
    });
  });

  describe('isUniqueViolation', () => {
    it('trả về true khi mã lỗi Prisma là P2002', () => {
      assert.equal(ClassAccessService.isUniqueViolation({ code: 'P2002' }), true);
    });

    it('trả về false khi mã lỗi không phải P2002', () => {
      assert.equal(ClassAccessService.isUniqueViolation({ code: 'P2003' }), false);
      assert.equal(ClassAccessService.isUniqueViolation({ message: 'Other error' }), false);
    });

    it('trả về false khi giá trị lỗi là null, undefined hoặc kiểu nguyên thủy', () => {
      assert.equal(ClassAccessService.isUniqueViolation(null), false);
      assert.equal(ClassAccessService.isUniqueViolation(undefined), false);
      assert.equal(ClassAccessService.isUniqueViolation('error'), false);
      assert.equal(ClassAccessService.isUniqueViolation(123), false);
    });
  });

  describe('lecturerClassFilter', () => {
    it('tạo bộ lọc Prisma bao gồm ownerId và coLecturers', () => {
      const filter = ClassAccessService.lecturerClassFilter('lecturer-1');
      assert.deepEqual(filter, {
        OR: [{ ownerId: 'lecturer-1' }, { coLecturers: { some: { lecturerId: 'lecturer-1' } } }]
      });
    });
  });

  describe('assertOwnedClass (owner rule & ended classes read-only)', () => {
    it('báo lỗi 404 khi lớp học không tồn tại trong hệ thống', async () => {
      mock.method(ClassRepository, 'findClassById', async () => null);

      await assert.rejects(
        ClassAccessService.assertOwnedClass('non-existent-id', 'lecturer-primary'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === ClassConstant.messages.CLASS_NOT_FOUND
      );
    });

    it('báo lỗi 404 khi giảng viên không phụ trách lớp (owner rule: không tiết lộ sự tồn tại)', async () => {
      const record = createMockClass({ ownerId: 'lecturer-1', coLecturers: [] });
      mock.method(ClassRepository, 'findClassById', async () => record);

      await assert.rejects(
        ClassAccessService.assertOwnedClass('class-1', 'stranger-lecturer'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === ClassConstant.messages.CLASS_NOT_FOUND
      );
    });

    it('trả về bản ghi lớp học khi người gọi là giảng viên chính', async () => {
      const record = createMockClass({ ownerId: 'lecturer-primary' });
      mock.method(ClassRepository, 'findClassById', async () => record);

      const result = await ClassAccessService.assertOwnedClass('class-1', 'lecturer-primary');
      assert.equal(result.id, 'class-1');
      assert.equal(result.ownerId, 'lecturer-primary');
    });

    it('trả về bản ghi lớp học khi người gọi là giảng viên cùng dạy', async () => {
      const record = createMockClass({
        ownerId: 'lecturer-primary',
        coLecturers: [{ lecturerId: 'lecturer-co', lecturer: { id: 'lecturer-co', username: 'co', email: 'co@fpt.edu.vn' } }]
      });
      mock.method(ClassRepository, 'findClassById', async () => record);

      const result = await ClassAccessService.assertOwnedClass('class-1', 'lecturer-co');
      assert.equal(result.id, 'class-1');
    });

    it('báo lỗi 409 MSG-08 khi yêu cầu lớp đang hoạt động nhưng lớp đã kết thúc (read-only)', async () => {
      const endedRecord = createMockClass({
        ownerId: 'lecturer-primary',
        status: 'ENDED',
        endedAt: new Date('2026-10-15T12:00:00.000Z')
      });
      mock.method(ClassRepository, 'findClassById', async () => endedRecord);

      await assert.rejects(
        ClassAccessService.assertOwnedClass('class-1', 'lecturer-primary', { requireActive: true }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08' &&
          err.message === ClassConstant.messages.CLASS_FINISHED
      );
    });

    it('cho phép xem thông tin lớp đã kết thúc khi không yêu cầu requireActive', async () => {
      const endedRecord = createMockClass({
        ownerId: 'lecturer-primary',
        status: 'ENDED',
        endedAt: new Date('2026-10-15T12:00:00.000Z')
      });
      mock.method(ClassRepository, 'findClassById', async () => endedRecord);

      const result = await ClassAccessService.assertOwnedClass('class-1', 'lecturer-primary', { requireActive: false });
      assert.equal(result.id, 'class-1');
      assert.equal(result.status, 'ENDED');
    });
  });

  describe('assertPrimaryLecturer', () => {
    it('báo lỗi 404 khi lớp học không tồn tại', async () => {
      mock.method(ClassRepository, 'findClassById', async () => null);

      await assert.rejects(
        ClassAccessService.assertPrimaryLecturer('non-existent-id', 'lecturer-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });

    it('báo lỗi 403 khi người dùng là giảng viên cùng dạy chứ không phải giảng viên chính', async () => {
      const record = createMockClass({
        ownerId: 'lecturer-primary',
        coLecturers: [{ lecturerId: 'lecturer-co', lecturer: { id: 'lecturer-co', username: 'co', email: 'co@fpt.edu.vn' } }]
      });
      mock.method(ClassRepository, 'findClassById', async () => record);

      await assert.rejects(
        ClassAccessService.assertPrimaryLecturer('class-1', 'lecturer-co'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 403 &&
          err.message === ClassConstant.messages.LECTURER_MANAGE_FORBIDDEN
      );
    });

    it('báo lỗi 409 MSG-08 khi giảng viên chính thao tác nhưng lớp đã kết thúc và requireActive=true', async () => {
      const endedRecord = createMockClass({
        ownerId: 'lecturer-primary',
        status: 'ENDED',
        endedAt: new Date('2026-10-15T12:00:00.000Z')
      });
      mock.method(ClassRepository, 'findClassById', async () => endedRecord);

      await assert.rejects(
        ClassAccessService.assertPrimaryLecturer('class-1', 'lecturer-primary', { requireActive: true }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08'
      );
    });

    it('trả về bản ghi lớp học khi người gọi là giảng viên chính của lớp đang hoạt động', async () => {
      const record = createMockClass({ ownerId: 'lecturer-primary', status: 'ACTIVE' });
      mock.method(ClassRepository, 'findClassById', async () => record);

      const result = await ClassAccessService.assertPrimaryLecturer('class-1', 'lecturer-primary', { requireActive: true });
      assert.equal(result.id, 'class-1');
      assert.equal(result.ownerId, 'lecturer-primary');
    });
  });

  describe('Giá trị biên (Boundary cases)', () => {
    it('isClassLecturer: tìm thấy khi giảng viên nằm ở cuối danh sách coLecturers đông người', () => {
      const record = createMockClass({
        ownerId: 'lecturer-primary',
        coLecturers: [
          { lecturerId: 'co-1', lecturer: { id: 'co-1', username: 'c1', email: 'c1@fpt.edu.vn' } },
          { lecturerId: 'co-2', lecturer: { id: 'co-2', username: 'c2', email: 'c2@fpt.edu.vn' } },
          { lecturerId: 'co-last', lecturer: { id: 'co-last', username: 'c-last', email: 'last@fpt.edu.vn' } }
        ]
      });
      assert.equal(ClassAccessService.isClassLecturer(record, 'co-last'), true);
    });

    it('isClassLecturer: trả về true khi người dùng vừa là ownerId vừa xuất hiện trong coLecturers', () => {
      const record = createMockClass({
        ownerId: 'lecturer-primary',
        coLecturers: [
          { lecturerId: 'lecturer-primary', lecturer: { id: 'lecturer-primary', username: 'p', email: 'p@fpt.edu.vn' } }
        ]
      });
      assert.equal(ClassAccessService.isClassLecturer(record, 'lecturer-primary'), true);
    });

    it('isClassLecturer: trả về false khi userId là chuỗi rỗng', () => {
      const record = createMockClass({ ownerId: 'lecturer-primary' });
      assert.equal(ClassAccessService.isClassLecturer(record, ''), false);
    });

    it('isUniqueViolation: xử lý object không có prototype (Object.create(null))', () => {
      const bareObj = Object.create(null);
      bareObj.code = 'P2002';
      assert.equal(ClassAccessService.isUniqueViolation(bareObj), true);

      const emptyBareObj = Object.create(null);
      assert.equal(ClassAccessService.isUniqueViolation(emptyBareObj), false);
    });

    it('isUniqueViolation: trả về false khi code phân biệt chữ hoa/thường hoặc không phải string (p2002, 2002)', () => {
      assert.equal(ClassAccessService.isUniqueViolation({ code: 'p2002' }), false);
      assert.equal(ClassAccessService.isUniqueViolation({ code: 2002 }), false);
      assert.equal(ClassAccessService.isUniqueViolation({}), false);
    });

    it('isUniqueViolation: nhận diện đúng instance Error chuẩn có gán code P2002', () => {
      const error = new Error('Prisma error');
      (error as any).code = 'P2002';
      assert.equal(ClassAccessService.isUniqueViolation(error), true);
    });

    it('assertOwnedClass: giảng viên cùng dạy truy cập lớp đã kết thúc khi requireActive=true bị ném 409 MSG-08', async () => {
      const endedRecord = createMockClass({
        ownerId: 'lecturer-primary',
        status: 'ENDED',
        coLecturers: [{ lecturerId: 'lecturer-co', lecturer: { id: 'lecturer-co', username: 'co', email: 'co@fpt.edu.vn' } }]
      });
      mock.method(ClassRepository, 'findClassById', async () => endedRecord);

      await assert.rejects(
        ClassAccessService.assertOwnedClass('class-1', 'lecturer-co', { requireActive: true }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.code === 'MSG-08'
      );
    });

    it('assertOwnedClass: không truyền options (mặc định) cho phép xem lớp đã kết thúc', async () => {
      const endedRecord = createMockClass({
        ownerId: 'lecturer-primary',
        status: 'ENDED'
      });
      mock.method(ClassRepository, 'findClassById', async () => endedRecord);

      const result = await ClassAccessService.assertOwnedClass('class-1', 'lecturer-primary');
      assert.equal(result.id, 'class-1');
      assert.equal(result.status, 'ENDED');
    });
  });
});
