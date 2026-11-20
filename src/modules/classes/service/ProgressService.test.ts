import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import ClassesConstant from '../constant/ClassesConstant.ts';
import ProgressDTO, { type ProgressItem } from '../dto/ProgressDTO.ts';
import ProgressRepository, { type ClassSummaryRecord, type ProgressMemberRecord } from '../repository/ProgressRepository.ts';
import ClassAccessService from './ClassAccessService.ts';
import ProgressPolicyService from './ProgressPolicyService.ts';
import ProgressService, { type ProgressQuery } from './ProgressService.ts';

const messages = ClassesConstant.messages;

function createMockClassSummary(overrides: Partial<ClassSummaryRecord> = {}): ClassSummaryRecord {
  return {
    id: 'class-1',
    name: 'TRN101.1',
    ownerId: 'lecturer-primary',
    coLecturers: [{ lecturerId: 'lecturer-co' }],
    ...overrides
  };
}

describe('ProgressService', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('listOwnedClasses', () => {
    it('trả về danh sách id và tên các lớp do giảng viên phụ trách', async () => {
      mock.method(ProgressRepository, 'findClassesByOwner', async () => [
        createMockClassSummary({ id: 'c-1', name: 'TRN101.1' }),
        createMockClassSummary({ id: 'c-2', name: 'TRN101.2' })
      ]);

      const result = await ProgressService.listOwnedClasses('lecturer-primary');
      assert.deepEqual(result, [
        { id: 'c-1', name: 'TRN101.1' },
        { id: 'c-2', name: 'TRN101.2' }
      ]);
    });

    it('giá trị biên: trả về mảng rỗng khi giảng viên không phụ trách lớp nào', async () => {
      mock.method(ProgressRepository, 'findClassesByOwner', async () => []);

      const result = await ProgressService.listOwnedClasses('lecturer-none');
      assert.deepEqual(result, []);
    });
  });

  describe('getOwnedClassOrThrow (Owner rule: GBR-01)', () => {
    it('báo lỗi 404 CLASS_NOT_FOUND khi lớp học không tồn tại', async () => {
      mock.method(ProgressRepository, 'findClassById', async () => null);

      await assert.rejects(
        ProgressService.getOwnedClassOrThrow('non-existent-id', 'lecturer-primary'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === messages.CLASS_NOT_FOUND
      );
    });

    it('báo lỗi 403 CLASS_FORBIDDEN khi giảng viên không phụ trách lớp học', async () => {
      const classRecord = createMockClassSummary({
        ownerId: 'lecturer-other',
        coLecturers: []
      });
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => false);

      await assert.rejects(
        ProgressService.getOwnedClassOrThrow('class-1', 'stranger-lecturer'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 403 &&
          err.message === messages.CLASS_FORBIDDEN
      );
    });

    it('trả về bản ghi lớp khi người gọi là giảng viên chính (ownerId)', async () => {
      const classRecord = createMockClassSummary({ ownerId: 'lecturer-primary' });
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);

      const result = await ProgressService.getOwnedClassOrThrow('class-1', 'lecturer-primary');
      assert.equal(result.id, 'class-1');
      assert.equal(result.ownerId, 'lecturer-primary');
    });

    it('trả về bản ghi lớp khi người gọi là giảng viên cùng dạy (coLecturer)', async () => {
      const classRecord = createMockClassSummary({
        ownerId: 'lecturer-primary',
        coLecturers: [{ lecturerId: 'lecturer-co' }]
      });
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);

      const result = await ProgressService.getOwnedClassOrThrow('class-1', 'lecturer-co');
      assert.equal(result.id, 'class-1');
    });
  });

  describe('getClassProgress (Average accuracy, Statuses & Summary)', () => {
    const mockMembers: ProgressMemberRecord[] = [
      { userId: 'u-1', username: 'Nguyen Van A', studentCode: 'SE1001' },
      { userId: 'u-2', username: 'Tran Thi B', studentCode: 'SE1002' },
      { userId: 'u-3', username: 'Le Van C', studentCode: 'SE1003' },
      { userId: 'u-4', username: 'Pham Thi D', studentCode: 'SE1004' }
    ];

    it('tính chính xác điểm trung bình, trạng thái ON_TRACK / AT_RISK / BEHIND và tổng hợp summary', async () => {
      const classRecord = createMockClassSummary();
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);

      mock.method(SystemConfigService, 'getNumber', async (key: string) => {
        if (key === 'min_accuracy_default') return 70;
        if (key === 'at_risk_margin') return 10;
        return 0;
      });

      mock.method(ProgressRepository, 'findMembers', async () => mockMembers);

      // u-1: 80, 90 -> avg 85.0 -> ON_TRACK
      // u-2: 60, 70 -> avg 65.0 -> AT_RISK (>= 60)
      // u-3: 50, 55 -> avg 52.5 -> BEHIND (< 60)
      // u-4: 0 bài nộp -> avg null -> status null
      mock.method(ProgressRepository, 'findAnalysedAccuracies', async () => [
        { studentId: 'u-1', accuracy: 80 },
        { studentId: 'u-1', accuracy: 90 },
        { studentId: 'u-2', accuracy: 60 },
        { studentId: 'u-2', accuracy: 70 },
        { studentId: 'u-3', accuracy: 50 },
        { studentId: 'u-3', accuracy: 55 }
      ]);

      const query: ProgressQuery = { sortBy: 'studentCode', sortDir: 'asc' };
      const result = await ProgressService.getClassProgress('class-1', 'lecturer-primary', query);

      // Summary của toàn lớp
      assert.deepEqual(result.summary, { onTrack: 1, atRisk: 1, behind: 1 });
      assert.equal(result.items.length, 4);

      const item1 = result.items.find((i) => i.userId === 'u-1')!;
      assert.equal(item1.submissionCount, 2);
      assert.equal(item1.averageAccuracy, 85.0);
      assert.equal(item1.status, 'ON_TRACK');

      const item2 = result.items.find((i) => i.userId === 'u-2')!;
      assert.equal(item2.submissionCount, 2);
      assert.equal(item2.averageAccuracy, 65.0);
      assert.equal(item2.status, 'AT_RISK');

      const item3 = result.items.find((i) => i.userId === 'u-3')!;
      assert.equal(item3.submissionCount, 2);
      assert.equal(item3.averageAccuracy, 52.5);
      assert.equal(item3.status, 'BEHIND');

      const item4 = result.items.find((i) => i.userId === 'u-4')!;
      assert.equal(item4.submissionCount, 0);
      assert.equal(item4.averageAccuracy, null);
      assert.equal(item4.status, null);
    });

    it('bộ lọc status lọc danh sách items nhưng giữ nguyên bộ đếm summary của toàn lớp', async () => {
      const classRecord = createMockClassSummary();
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);

      mock.method(SystemConfigService, 'getNumber', async (key: string) => {
        if (key === 'min_accuracy_default') return 70;
        if (key === 'at_risk_margin') return 10;
        return 0;
      });

      mock.method(ProgressRepository, 'findMembers', async () => mockMembers);
      mock.method(ProgressRepository, 'findAnalysedAccuracies', async () => [
        { studentId: 'u-1', accuracy: 85 },
        { studentId: 'u-2', accuracy: 65 },
        { studentId: 'u-3', accuracy: 50 }
      ]);

      const query: ProgressQuery = { status: 'ON_TRACK', sortBy: 'studentCode', sortDir: 'asc' };
      const result = await ProgressService.getClassProgress('class-1', 'lecturer-primary', query);

      // Items chỉ có học viên ON_TRACK
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].userId, 'u-1');

      // Nhưng summary vẫn giữ số liệu toàn lớp
      assert.deepEqual(result.summary, { onTrack: 1, atRisk: 1, behind: 1 });
    });

    it('giá trị biên: lớp học có 0 sinh viên', async () => {
      const classRecord = createMockClassSummary();
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);
      mock.method(SystemConfigService, 'getNumber', async () => 70);
      mock.method(ProgressRepository, 'findMembers', async () => []);
      mock.method(ProgressRepository, 'findAnalysedAccuracies', async () => []);

      const result = await ProgressService.getClassProgress('class-1', 'lecturer-primary', {
        sortBy: 'studentCode',
        sortDir: 'asc'
      });

      assert.deepEqual(result.summary, { onTrack: 0, atRisk: 0, behind: 0 });
      assert.deepEqual(result.items, []);
    });

    it('giá trị biên: toàn bộ sinh viên trong lớp chưa có bài nộp nào được phân tích', async () => {
      const classRecord = createMockClassSummary();
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);
      mock.method(SystemConfigService, 'getNumber', async () => 70);
      mock.method(ProgressRepository, 'findMembers', async () => mockMembers.slice(0, 2));
      mock.method(ProgressRepository, 'findAnalysedAccuracies', async () => []);

      const result = await ProgressService.getClassProgress('class-1', 'lecturer-primary', {
        sortBy: 'studentCode',
        sortDir: 'asc'
      });

      assert.deepEqual(result.summary, { onTrack: 0, atRisk: 0, behind: 0 });
      assert.equal(result.items.length, 2);
      assert.equal(result.items[0].averageAccuracy, null);
      assert.equal(result.items[0].status, null);
      assert.equal(result.items[0].submissionCount, 0);
    });

    it('giá trị biên: sinh viên đạt đúng điểm ngưỡng 70.0 (ON_TRACK), 60.0 (AT_RISK) và 59.9 (BEHIND)', async () => {
      const classRecord = createMockClassSummary();
      mock.method(ProgressRepository, 'findClassById', async () => classRecord);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);
      mock.method(SystemConfigService, 'getNumber', async (key: string) => (key === 'min_accuracy_default' ? 70 : 10));

      const thresholdMembers = [
        { userId: 'u-on', username: 'Exact 70', studentCode: 'SE70' },
        { userId: 'u-risk', username: 'Exact 60', studentCode: 'SE60' },
        { userId: 'u-behind', username: 'Just 59.9', studentCode: 'SE59' }
      ];
      mock.method(ProgressRepository, 'findMembers', async () => thresholdMembers);
      mock.method(ProgressRepository, 'findAnalysedAccuracies', async () => [
        { studentId: 'u-on', accuracy: 70 },
        { studentId: 'u-risk', accuracy: 60 },
        { studentId: 'u-behind', accuracy: 59.9 }
      ]);

      const result = await ProgressService.getClassProgress('class-1', 'lecturer-primary', {
        sortBy: 'studentCode',
        sortDir: 'asc'
      });

      assert.equal(result.items.find((i) => i.userId === 'u-on')?.status, 'ON_TRACK');
      assert.equal(result.items.find((i) => i.userId === 'u-risk')?.status, 'AT_RISK');
      assert.equal(result.items.find((i) => i.userId === 'u-behind')?.status, 'BEHIND');
      assert.deepEqual(result.summary, { onTrack: 1, atRisk: 1, behind: 1 });
    });
  });

  describe('filterAndSort (Filtering and Sorting)', () => {
    const sampleItems: ProgressItem[] = [
      { userId: '1', username: 'An Nguyen', studentCode: 'SE1001', submissionCount: 3, averageAccuracy: 85.5, status: 'ON_TRACK' },
      { userId: '2', username: 'Binh Tran', studentCode: 'SE1002', submissionCount: 2, averageAccuracy: 62.0, status: 'AT_RISK' },
      { userId: '3', username: 'Cuong Le', studentCode: 'SE1003', submissionCount: 1, averageAccuracy: 45.0, status: 'BEHIND' },
      { userId: '4', username: 'Dung Pham', studentCode: null, submissionCount: 0, averageAccuracy: null, status: null },
      { userId: '5', username: 'Anh Vu', studentCode: 'SE1005', submissionCount: 4, averageAccuracy: 95.0, status: 'ON_TRACK' }
    ];

    describe('Bộ lọc (Filters)', () => {
      it('lọc theo status ON_TRACK', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          status: 'ON_TRACK',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 2);
        assert.ok(result.every((i) => i.status === 'ON_TRACK'));
      });

      it('lọc theo status AT_RISK', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          status: 'AT_RISK',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].userId, '2');
      });

      it('lọc theo status BEHIND', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          status: 'BEHIND',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].userId, '3');
      });

      it('lọc tìm kiếm keyword q theo username (không phân biệt chữ hoa/thường)', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          q: 'nguyen',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].username, 'An Nguyen');
      });

      it('lọc tìm kiếm keyword q theo studentCode', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          q: 'se1002',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].studentCode, 'SE1002');
      });

      it('giá trị biên: tìm kiếm sinh viên có studentCode = null không gây lỗi', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          q: 'dung',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].username, 'Dung Pham');
        assert.equal(result[0].studentCode, null);
      });

      it('giá trị biên: tìm kiếm keyword không khớp trả về mảng rỗng', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          q: 'xyz_unknown',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 0);
      });

      it('kết hợp đồng thời bộ lọc status và từ khóa q', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          status: 'ON_TRACK',
          q: 'anh',
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].username, 'Anh Vu');
      });
    });

    describe('Sắp xếp (Sorting)', () => {
      it('sắp xếp theo averageAccuracy tăng dần (asc): giá trị null luôn ở cuối cùng', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          sortBy: 'averageAccuracy',
          sortDir: 'asc'
        });

        const accuracies = result.map((i) => i.averageAccuracy);
        // [45.0, 62.0, 85.5, 95.0, null]
        assert.deepEqual(accuracies, [45.0, 62.0, 85.5, 95.0, null]);
      });

      it('sắp xếp theo averageAccuracy giảm dần (desc): giá trị null vẫn luôn ở cuối cùng', () => {
        const result = ProgressService.filterAndSort(sampleItems, {
          sortBy: 'averageAccuracy',
          sortDir: 'desc'
        });

        const accuracies = result.map((i) => i.averageAccuracy);
        // [95.0, 85.5, 62.0, 45.0, null]
        assert.deepEqual(accuracies, [95.0, 85.5, 62.0, 45.0, null]);
      });

      it('sắp xếp theo username asc và desc', () => {
        const asc = ProgressService.filterAndSort(sampleItems, {
          sortBy: 'username',
          sortDir: 'asc'
        });
        assert.equal(asc[0].username, 'An Nguyen');

        const desc = ProgressService.filterAndSort(sampleItems, {
          sortBy: 'username',
          sortDir: 'desc'
        });
        assert.equal(desc[0].username, 'Dung Pham');
      });

      it('sắp xếp theo studentCode asc và desc (xử lý studentCode null như chuỗi rỗng)', () => {
        const asc = ProgressService.filterAndSort(sampleItems, {
          sortBy: 'studentCode',
          sortDir: 'asc'
        });
        // studentCode null coi là '' nên nằm đầu tiên khi asc
        assert.equal(asc[0].studentCode, null);
        assert.equal(asc[1].studentCode, 'SE1001');

        const desc = ProgressService.filterAndSort(sampleItems, {
          sortBy: 'studentCode',
          sortDir: 'desc'
        });
        assert.equal(desc[0].studentCode, 'SE1005');
        assert.equal(desc[desc.length - 1].studentCode, null);
      });

      it('giá trị biên: hai học viên có cùng averageAccuracy', () => {
        const tiedItems: ProgressItem[] = [
          { userId: '1', username: 'A', studentCode: 'S1', submissionCount: 1, averageAccuracy: 75.0, status: 'ON_TRACK' },
          { userId: '2', username: 'B', studentCode: 'S2', submissionCount: 1, averageAccuracy: 75.0, status: 'ON_TRACK' }
        ];

        const result = ProgressService.filterAndSort(tiedItems, {
          sortBy: 'averageAccuracy',
          sortDir: 'asc'
        });
        assert.equal(result.length, 2);
        assert.equal(result[0].averageAccuracy, 75.0);
        assert.equal(result[1].averageAccuracy, 75.0);
      });

      it('giá trị biên: danh sách tất cả học viên đều có averageAccuracy là null', () => {
        const allNullItems: ProgressItem[] = [
          { userId: '1', username: 'A', studentCode: 'S1', submissionCount: 0, averageAccuracy: null, status: null },
          { userId: '2', username: 'B', studentCode: 'S2', submissionCount: 0, averageAccuracy: null, status: null }
        ];

        const resultAsc = ProgressService.filterAndSort(allNullItems, {
          sortBy: 'averageAccuracy',
          sortDir: 'asc'
        });
        assert.equal(resultAsc.length, 2);

        const resultDesc = ProgressService.filterAndSort(allNullItems, {
          sortBy: 'averageAccuracy',
          sortDir: 'desc'
        });
        assert.equal(resultDesc.length, 2);
      });
    });
  });
});
