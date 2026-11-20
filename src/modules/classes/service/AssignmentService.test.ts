import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import EnsemblePolicyService from '../../ensemble/service/EnsemblePolicyService.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import ClassesConstant from '../constant/ClassesConstant.ts';
import AssignmentRepository, { type AssignmentDetailRow, type AssignmentRow } from '../repository/AssignmentRepository.ts';
import AssignmentPolicyService from './AssignmentPolicyService.ts';
import AssignmentService, { type MyAssignmentsQuery } from './AssignmentService.ts';

const messages = ClassesConstant.messages;

function createMockAssignmentRow(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: 'asg-1',
    classId: 'class-1',
    title: 'Bài tập 1: Luyện ngón căn bản',
    type: 'PRACTICE',
    description: 'Mô tả bài tập',
    weekNo: 1,
    deadline: new Date('2026-10-25T17:00:00.000Z'),
    targetBpm: 80,
    minAccuracy: null, // sẽ dùng mặc định 70 nếu null
    maxSubmissions: 3,
    isPublished: true,
    bonusPoints: null,
    class: { id: 'class-1', name: 'TRN101.1' },
    submissions: [],
    currentVersion: { kind: 'SOLO' as any },
    ...overrides
  };
}

describe('AssignmentService', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('buildListItem', () => {
    const fixedNow = new Date('2026-10-15T10:00:00.000Z');

    it('sử dụng minAccuracy mặc định khi row.minAccuracy là null', () => {
      const row = createMockAssignmentRow({ minAccuracy: null });
      const item = AssignmentService.buildListItem(row, 70, fixedNow);

      assert.equal(item.minAccuracy, 70);
      assert.equal(item.status, 'NOT_SUBMITTED');
      assert.equal(item.usedSubmissions, 0);
      assert.equal(item.maxSubmissions, 3);
    });

    it('ưu tiên minAccuracy riêng của bài tập khi được cấu hình', () => {
      const row = createMockAssignmentRow({ minAccuracy: 85 });
      const item = AssignmentService.buildListItem(row, 70, fixedNow);

      assert.equal(item.minAccuracy, 85);
    });

    it('tính toán số lượt nộp đã dùng (bỏ qua REJECTED và FAILED)', () => {
      const row = createMockAssignmentRow({
        submissions: [
          { status: 'COMPLETED', accuracy: 65 },
          { status: 'REJECTED', accuracy: null },
          { status: 'FAILED', accuracy: null },
          { status: 'PROCESSING', accuracy: null }
        ]
      });
      const item = AssignmentService.buildListItem(row, 70, fixedNow);

      assert.equal(item.usedSubmissions, 2);
      assert.equal(item.status, 'SUBMITTED');
    });

    it('xác định trạng thái PASSED khi có bài nộp đạt minAccuracy', () => {
      const row = createMockAssignmentRow({
        minAccuracy: 75,
        submissions: [
          { status: 'COMPLETED', accuracy: 70 },
          { status: 'COMPLETED', accuracy: 80 }
        ]
      });
      const item = AssignmentService.buildListItem(row, 70, fixedNow);

      assert.equal(item.status, 'PASSED');
    });

    it('xác định trạng thái OVERDUE khi đã quá hạn deadline và chưa nộp', () => {
      const row = createMockAssignmentRow({
        deadline: new Date('2026-10-01T10:00:00.000Z'),
        submissions: []
      });
      const item = AssignmentService.buildListItem(row, 70, fixedNow);

      assert.equal(item.status, 'OVERDUE');
    });
  });

  describe('listMine (Student assignment list: filters & sorting)', () => {
    it('trả về mảng rỗng khi sinh viên không tham gia lớp học nào (memberships = 0)', async () => {
      mock.method(AssignmentRepository, 'findMemberships', async () => []);

      const result = await AssignmentService.listMine('student-no-class', {
        sortBy: 'deadline',
        sortDir: 'asc'
      });
      assert.deepEqual(result, []);
    });

    it('lấy danh sách bài tập đã giao và áp dụng minAccuracy mặc định từ cấu hình', async () => {
      mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'class-1', instrumentId: 'inst-1' }]);
      mock.method(SystemConfigService, 'getNumber', async () => 70);

      const rows = [
        createMockAssignmentRow({ id: 'a-1', title: 'Bài A', deadline: new Date('2026-10-20T00:00:00.000Z') }),
        createMockAssignmentRow({ id: 'a-2', title: 'Bài B', deadline: new Date('2026-10-25T00:00:00.000Z') })
      ];
      mock.method(AssignmentRepository, 'findPublishedForStudent', async () => rows);

      const result = await AssignmentService.listMine('student-1', {
        sortBy: 'title',
        sortDir: 'asc'
      });

      assert.equal(result.length, 2);
      assert.equal(result[0].id, 'a-1');
      assert.equal(result[1].id, 'a-2');
    });

    describe('Bộ lọc (Filters)', () => {
      const mockRows: AssignmentRow[] = [
        createMockAssignmentRow({
          id: 'a-pass',
          classId: 'c-1',
          title: 'Độc tấu Lưu thủy',
          type: 'PRACTICE',
          deadline: new Date('2099-01-01'),
          submissions: [{ status: 'COMPLETED', accuracy: 85 }]
        }),
        createMockAssignmentRow({
          id: 'a-sub',
          classId: 'c-1',
          title: 'Hòa tấu Kim tiền',
          type: 'RHYTHM',
          deadline: new Date('2099-01-01'),
          submissions: [{ status: 'COMPLETED', accuracy: 50 }]
        }),
        createMockAssignmentRow({
          id: 'a-over',
          classId: 'c-2',
          title: 'Bài tập tuần 1',
          type: 'PRACTICE',
          deadline: new Date('2020-01-01'), // quá hạn
          submissions: []
        }),
        createMockAssignmentRow({
          id: 'a-bonus',
          classId: 'c-2',
          title: 'Thử thách bài Bonus',
          type: 'BONUS',
          bonusPoints: 10,
          deadline: new Date('2099-01-01'),
          submissions: []
        })
      ];

      it('lọc theo classId', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [
          { classId: 'c-1', instrumentId: 'inst-1' },
          { classId: 'c-2', instrumentId: 'inst-1' }
        ]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => mockRows);

        const result = await AssignmentService.listMine('student-1', {
          classId: 'c-1',
          sortBy: 'title',
          sortDir: 'asc'
        });

        assert.equal(result.length, 2);
        assert.ok(result.every((r) => r.classId === 'c-1'));
      });

      it('lọc theo type BONUS và NON_BONUS', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'c-1', instrumentId: 'i-1' }]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => mockRows);

        const bonusResult = await AssignmentService.listMine('student-1', {
          type: 'BONUS',
          sortBy: 'title',
          sortDir: 'asc'
        });
        assert.equal(bonusResult.length, 1);
        assert.equal(bonusResult[0].id, 'a-bonus');

        const nonBonusResult = await AssignmentService.listMine('student-1', {
          type: 'NON_BONUS',
          sortBy: 'title',
          sortDir: 'asc'
        });
        assert.equal(nonBonusResult.length, 3);
        assert.ok(nonBonusResult.every((r) => r.type !== 'BONUS'));
      });

      it('lọc theo status (PASSED / SUBMITTED / OVERDUE / NOT_SUBMITTED)', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'c-1', instrumentId: 'i-1' }]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => mockRows);

        const passed = await AssignmentService.listMine('student-1', {
          status: 'PASSED',
          sortBy: 'title',
          sortDir: 'asc'
        });
        assert.equal(passed.length, 1);
        assert.equal(passed[0].id, 'a-pass');

        const overdue = await AssignmentService.listMine('student-1', {
          status: 'OVERDUE',
          sortBy: 'title',
          sortDir: 'asc'
        });
        assert.equal(overdue.length, 1);
        assert.equal(overdue[0].id, 'a-over');
      });

      it('lọc tìm kiếm keyword q theo tiêu đề bài tập (case-insensitive)', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'c-1', instrumentId: 'i-1' }]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => mockRows);

        const result = await AssignmentService.listMine('student-1', {
          q: 'lưu thủy',
          sortBy: 'title',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].id, 'a-pass');
      });

      it('giá trị biên: từ khóa q không khớp bài nào trả về mảng rỗng', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'c-1', instrumentId: 'i-1' }]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => mockRows);

        const result = await AssignmentService.listMine('student-1', {
          q: 'từ khóa không tồn tại',
          sortBy: 'title',
          sortDir: 'asc'
        });
        assert.deepEqual(result, []);
      });

      it('kết hợp đồng thời các bộ lọc: classId + type + status + q', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'c-1', instrumentId: 'i-1' }]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => mockRows);

        const result = await AssignmentService.listMine('student-1', {
          classId: 'c-1',
          type: 'NON_BONUS',
          status: 'PASSED',
          q: 'lưu thủy',
          sortBy: 'title',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].id, 'a-pass');
      });
    });

    describe('Sắp xếp (Sorting)', () => {
      const sortRows: AssignmentRow[] = [
        createMockAssignmentRow({ id: '1', title: 'C - Bài tập 3', deadline: new Date('2026-10-30T00:00:00.000Z') }),
        createMockAssignmentRow({ id: '2', title: 'A - Bài tập 1', deadline: new Date('2026-10-10T00:00:00.000Z') }),
        createMockAssignmentRow({ id: '3', title: 'B - Bài tập 2', deadline: new Date('2026-10-20T00:00:00.000Z') })
      ];

      it('sắp xếp theo title tăng dần và giảm dần', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'c-1', instrumentId: 'i-1' }]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => sortRows);

        const asc = await AssignmentService.listMine('student-1', { sortBy: 'title', sortDir: 'asc' });
        assert.deepEqual(asc.map((r) => r.id), ['2', '3', '1']);

        const desc = await AssignmentService.listMine('student-1', { sortBy: 'title', sortDir: 'desc' });
        assert.deepEqual(desc.map((r) => r.id), ['1', '3', '2']);
      });

      it('sắp xếp theo deadline tăng dần và giảm dần', async () => {
        mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'c-1', instrumentId: 'i-1' }]);
        mock.method(SystemConfigService, 'getNumber', async () => 70);
        mock.method(AssignmentRepository, 'findPublishedForStudent', async () => sortRows);

        const asc = await AssignmentService.listMine('student-1', { sortBy: 'deadline', sortDir: 'asc' });
        assert.deepEqual(asc.map((r) => r.id), ['2', '3', '1']);

        const desc = await AssignmentService.listMine('student-1', { sortBy: 'deadline', sortDir: 'desc' });
        assert.deepEqual(desc.map((r) => r.id), ['1', '3', '2']);
      });
    });
  });

  describe('getDetail', () => {
    function createMockDetailRow(overrides: Partial<AssignmentDetailRow> = {}): AssignmentDetailRow {
      return {
        ...createMockAssignmentRow(),
        submissions: [],
        sheetMusic: {
          id: 'sheet-1',
          piece: {
            id: 'p-1',
            title: 'Lưu thủy',
            bpm: 80,
            sheetMusic: [{ instrumentId: 'inst-other' }],
            mediaFileId: 'mf-1',
            isPublic: true
          } as any
        },
        rubric: {
          criteria: [{ name: 'Độ chính xác cao độ', weight: 50 }, { name: 'Nhịp điệu', weight: 50 }]
        },
        ...overrides
      };
    }

    it('báo lỗi 404 ASSIGNMENT_NOT_FOUND khi bài tập không tồn tại', async () => {
      mock.method(AssignmentRepository, 'findDetailForStudent', async () => null);
      mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'class-1', instrumentId: 'inst-1' }]);

      await assert.rejects(
        AssignmentService.getDetail('student-1', 'non-existent-asg'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === messages.ASSIGNMENT_NOT_FOUND
      );
    });

    it('báo lỗi 404 khi bài tập chưa được công bố (isPublished = false)', async () => {
      const row = createMockDetailRow({ isPublished: false });
      mock.method(AssignmentRepository, 'findDetailForStudent', async () => row);
      mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'class-1', instrumentId: 'inst-1' }]);

      await assert.rejects(
        AssignmentService.getDetail('student-1', 'asg-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });

    it('báo lỗi 404 khi học viên không thuộc lớp học của bài tập', async () => {
      const row = createMockDetailRow({ classId: 'class-1' });
      mock.method(AssignmentRepository, 'findDetailForStudent', async () => row);
      // Student is in class-2, not class-1
      mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'class-2', instrumentId: 'inst-1' }]);

      await assert.rejects(
        AssignmentService.getDetail('student-1', 'asg-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });

    it('trả về chi tiết bài tập đầy đủ kèm cờ canSubmit và hasEnsembleTracks', async () => {
      const row = createMockDetailRow({
        classId: 'class-1',
        deadline: new Date('2099-01-01'),
        maxSubmissions: 3,
        submissions: [
          {
            id: 'sub-1',
            status: 'COMPLETED',
            accuracy: 85,
            createdAt: new Date('2026-10-10'),
            comment: { content: 'Tốt', updatedAt: new Date('2026-10-11') }
          }
        ]
      });

      mock.method(AssignmentRepository, 'findDetailForStudent', async () => row);
      mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'class-1', instrumentId: 'inst-tranh' }]);
      mock.method(SystemConfigService, 'getNumber', async () => 70);
      mock.method(EnsemblePolicyService, 'canPracticePiece', () => true);

      const detail = await AssignmentService.getDetail('student-1', 'asg-1');

      assert.equal(detail.id, 'asg-1');
      assert.equal(detail.canSubmit, true);
      assert.equal(detail.hasEnsembleTracks, true);
      assert.equal(detail.rubric.length, 2);
      assert.equal(detail.submissions.length, 1);
      assert.equal(detail.status, 'PASSED');
    });

    it('giá trị biên: canSubmit = false khi bài tập đã hết lượt nộp', async () => {
      const row = createMockDetailRow({
        classId: 'class-1',
        deadline: new Date('2099-01-01'),
        maxSubmissions: 2,
        submissions: [
          { id: 's1', status: 'COMPLETED', accuracy: 50, createdAt: new Date(), comment: null },
          { id: 's2', status: 'COMPLETED', accuracy: 60, createdAt: new Date(), comment: null }
        ]
      });

      mock.method(AssignmentRepository, 'findDetailForStudent', async () => row);
      mock.method(AssignmentRepository, 'findMemberships', async () => [{ classId: 'class-1', instrumentId: 'inst-tranh' }]);
      mock.method(SystemConfigService, 'getNumber', async () => 70);

      const detail = await AssignmentService.getDetail('student-1', 'asg-1');
      assert.equal(detail.canSubmit, false);
      assert.equal(detail.usedSubmissions, 2);
      assert.equal(detail.maxSubmissions, 2);
    });
  });
});
