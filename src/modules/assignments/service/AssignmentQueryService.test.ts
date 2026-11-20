import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import GradingSettingsService from '../../platform/service/GradingSettingsService.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import AssignmentRepository from '../repository/AssignmentRepository.ts';
import SubmissionRepository from '../repository/SubmissionRepository.ts';
import AssignmentAccessService from './AssignmentAccessService.ts';
import AssignmentQueryService from './AssignmentQueryService.ts';

const messages = AssignmentConstant.messages;

function createMockAssignment(overrides: Partial<Backend.AssignmentRecord> = {}): Backend.AssignmentRecord {
  return {
    id: 'asg-1',
    classId: 'class-1',
    createdById: 'lecturer-1',
    status: 'PUBLISHED',
    deadline: new Date('2026-12-31T00:00:00.000Z'),
    maxSubmissions: 3,
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
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
      title: 'Bài tập 1: Luyện ngón',
      description: 'Mô tả bài tập',
      kind: 'OTHER',
      requiredBpm: 80,
      sheetMusicId: 'sheet-1',
      sheetMusic: {
        id: 'sheet-1',
        name: 'Sheet 1',
        visibility: 'PUBLIC',
        moderation: 'NORMAL',
        piece: {
          id: 'p-1',
          title: 'Lưu thủy hành vân',
          bpm: 80,
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

const mockSemesters: Backend.Semester[] = [
  { name: 'FA26', startDate: '2026-09-01', endDate: '2026-12-20' },
  { name: 'SP27', startDate: '2027-01-05', endDate: '2027-04-20' }
];

describe('AssignmentQueryService (Assignment reads: lists & submissions)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('listAssignments (Danh sách bài tập của giảng viên: phân trang, bộ lọc)', () => {
    it('lấy danh sách bài tập kèm số lượng thành viên và số học sinh đã nộp bài', async () => {
      const assignment1 = createMockAssignment({ id: 'asg-1', classId: 'c-1' });
      const assignment2 = createMockAssignment({ id: 'asg-2', classId: 'c-1' });

      mock.method(AssignmentRepository, 'findLecturerAssignments', async () => ({
        records: [assignment1, assignment2],
        total: 2
      }));

      // 2 sinh viên đang hoạt động trong lớp c-1
      mock.method(SubmissionRepository, 'findActiveMembers', async () => [
        { classId: 'c-1', user: { id: 's-1', username: 'Sinh viên 1', studentCode: 'SE1' } },
        { classId: 'c-1', user: { id: 's-2', username: 'Sinh viên 2', studentCode: 'SE2' } }
      ]);

      // s-1 đã nộp bài asg-1; s-2 đã nộp bài asg-2
      mock.method(SubmissionRepository, 'findCountedSubmitters', async () => [
        { assignmentId: 'asg-1', studentId: 's-1' },
        { assignmentId: 'asg-2', studentId: 's-2' }
      ]);

      const query: Backend.AssignmentListQuery = { page: 1, limit: 10 };
      const result = await AssignmentQueryService.listAssignments('lecturer-1', query);

      assert.equal(result.items.length, 2);
      assert.equal(result.pagination.total, 2);

      const item1 = result.items[0];
      assert.equal(item1.id, 'asg-1');
      assert.equal(item1.memberCount, 2);
      assert.equal(item1.submittedCount, 1);
    });

    it('giá trị biên: học sinh đã rời lớp (không còn active) không được tính vào submittedCount', async () => {
      const assignment = createMockAssignment({ id: 'asg-1', classId: 'c-1' });
      mock.method(AssignmentRepository, 'findLecturerAssignments', async () => ({
        records: [assignment],
        total: 1
      }));

      // Chỉ có s-active là thành viên hiện tại
      mock.method(SubmissionRepository, 'findActiveMembers', async () => [
        { classId: 'c-1', user: { id: 's-active', username: 'Active', studentCode: 'SE1' } }
      ]);

      // s-dropped (học sinh đã rời lớp) đã nộp bài trước đó
      mock.method(SubmissionRepository, 'findCountedSubmitters', async () => [
        { assignmentId: 'asg-1', studentId: 's-dropped' }
      ]);

      const result = await AssignmentQueryService.listAssignments('lecturer-1', { page: 1, limit: 10 });
      assert.equal(result.items[0].memberCount, 1);
      assert.equal(result.items[0].submittedCount, 0); // không tính s-dropped
    });

    it('giá trị biên: giảng viên không có bài tập nào (total = 0)', async () => {
      mock.method(AssignmentRepository, 'findLecturerAssignments', async () => ({
        records: [],
        total: 0
      }));
      mock.method(SubmissionRepository, 'findActiveMembers', async () => []);
      mock.method(SubmissionRepository, 'findCountedSubmitters', async () => []);

      const result = await AssignmentQueryService.listAssignments('lecturer-1', { page: 1, limit: 20 });
      assert.deepEqual(result.items, []);
      assert.equal(result.pagination.total, 0);
    });
  });

  describe('getOverview (Tổng quan bài tập theo học kỳ hiện tại)', () => {
    it('trả về danh sách lớp và bài tập trong học kỳ hiện tại kèm số lượt luyện tập và nộp bài', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

      const classRecord = {
        id: 'c-1',
        name: 'TRN101.1',
        status: 'ACTIVE',
        assignments: [createMockAssignment({ id: 'asg-1', classId: 'c-1' })]
      };
      mock.method(AssignmentRepository, 'findClassesWithAssignments', async () => [classRecord]);
      mock.method(SubmissionRepository, 'findActiveMembers', async () => [
        { classId: 'c-1', user: { id: 's-1', username: 'SV 1', studentCode: 'SE1' } }
      ]);
      mock.method(SubmissionRepository, 'findCountedSubmitters', async () => [
        { assignmentId: 'asg-1', studentId: 's-1' }
      ]);
      mock.method(SubmissionRepository, 'countPracticesByAssignment', async () => new Map([['asg-1', 5]]));

      // Ngày hiện tại thuộc học kỳ FA26
      const now = new Date('2026-10-15T10:00:00+07:00');
      const overview = await AssignmentQueryService.getOverview('lecturer-1', now);

      assert.equal(overview.semester?.name, 'FA26');
      assert.equal(overview.classes.length, 1);
      assert.equal(overview.classes[0].name, 'TRN101.1');
      assert.equal(overview.classes[0].memberCount, 1);
      assert.equal(overview.classes[0].assignments[0].practiceCount, 5);
      assert.equal(overview.classes[0].assignments[0].submittedCount, 1);
    });

    it('giá trị biên: thời điểm hiện tại không thuộc học kỳ nào (semester = null)', async () => {
      mock.method(SystemConfigService, 'getSemesters', async () => mockSemesters);

      // Ngày 2026-12-25 nằm giữa FA26 (kết thúc 20/12) và SP27 (bắt đầu 05/01)
      const now = new Date('2026-12-25T10:00:00+07:00');
      const overview = await AssignmentQueryService.getOverview('lecturer-1', now);

      assert.equal(overview.semester, null);
      assert.equal(overview.emptyReason, 'NO_CURRENT_SEMESTER');
      assert.deepEqual(overview.classes, []);
    });
  });

  describe('getAssignmentDetail (Chi tiết bài tập & tiến độ học sinh - UC-15)', () => {
    it('trả về chi tiết bài tập và thống kê tiến độ từng sinh viên (status, submissionCount, bestAccuracy)', async () => {
      const assignment = createMockAssignment({ id: 'asg-1', classId: 'c-1' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => assignment);
      mock.method(GradingSettingsService, 'getGradingSettings', async () => ({ minAccuracy: 70 }));

      mock.method(SubmissionRepository, 'findActiveMembers', async () => [
        { classId: 'c-1', user: { id: 's-passed', username: 'SV Đạt', studentCode: 'SE1' } },
        { classId: 'c-1', user: { id: 's-submitted', username: 'SV Đã nộp', studentCode: 'SE2' } },
        { classId: 'c-1', user: { id: 's-none', username: 'SV Chưa nộp', studentCode: 'SE3' } }
      ]);

      const snapshots = new Map<string, Backend.SubmissionSnapshot[]>([
        ['s-passed', [{ status: 'COMPLETED', accuracy: 85, submittedAt: new Date('2026-10-10') }]],
        ['s-submitted', [{ status: 'COMPLETED', accuracy: 55, submittedAt: new Date('2026-10-11') }]]
      ]);
      mock.method(SubmissionRepository, 'findSnapshotsByStudent', async () => snapshots);

      const detail = await AssignmentQueryService.getAssignmentDetail('asg-1', 'lecturer-1');

      assert.equal(detail.id, 'asg-1');
      assert.equal(detail.students.length, 3);

      const passedStudent = detail.students.find((s) => s.studentId === 's-passed')!;
      assert.equal(passedStudent.status, 'PASSED');
      assert.equal(passedStudent.bestAccuracy, 85);
      assert.equal(passedStudent.submissionCount, 1);

      const submittedStudent = detail.students.find((s) => s.studentId === 's-submitted')!;
      assert.equal(submittedStudent.status, 'SUBMITTED');
      assert.equal(submittedStudent.bestAccuracy, 55);

      const noneStudent = detail.students.find((s) => s.studentId === 's-none')!;
      assert.equal(noneStudent.status, 'NOT_SUBMITTED');
      assert.equal(noneStudent.bestAccuracy, null);
      assert.equal(noneStudent.submissionCount, 0);
    });

    it('giá trị biên: lớp học có 0 thành viên active', async () => {
      const assignment = createMockAssignment({ id: 'asg-1', classId: 'c-1' });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => assignment);
      mock.method(GradingSettingsService, 'getGradingSettings', async () => ({ minAccuracy: 70 }));
      mock.method(SubmissionRepository, 'findActiveMembers', async () => []);
      mock.method(SubmissionRepository, 'findSnapshotsByStudent', async () => new Map());

      const detail = await AssignmentQueryService.getAssignmentDetail('asg-1', 'lecturer-1');
      assert.deepEqual(detail.students, []);
    });

    it('báo lỗi 404 khi bài tập không tồn tại hoặc giảng viên không có quyền', async () => {
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => {
        throw AppError.notFound(messages.ASSIGNMENT_NOT_FOUND);
      });

      await assert.rejects(
        AssignmentQueryService.getAssignmentDetail('non-existent-asg', 'lecturer-1'),
        (err: unknown) => err instanceof AppError && err.statusCode === 404
      );
    });
  });

  describe('getStudentSubmissions (Danh sách bài nộp của một sinh viên & khóa nhận xét)', () => {
    it('trả về danh sách bài nộp theo số thứ tự đảo ngược (mới nhất lên đầu) và cờ canComment = true khi lớp active', async () => {
      const assignment = createMockAssignment({
        id: 'asg-1',
        class: { id: 'c-1', name: 'Lớp 1', status: 'ACTIVE', ownerId: 'lecturer-1', coLecturers: [] } as any
      });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => assignment);
      mock.method(MemberRepository, 'findActiveMembership', async () => ({ id: 'mem-1' }));
      mock.method(SubmissionRepository, 'findStudentProfile', async () => ({
        id: 's-1',
        username: 'Sinh vien A',
        studentCode: 'SE1001'
      }));

      // findStudentSubmissions trả về theo thứ tự thời gian cũ -> mới
      mock.method(SubmissionRepository, 'findStudentSubmissions', async () => [
        { id: 'sub-1', status: 'COMPLETED', accuracy: 60, submittedAt: new Date('2026-10-01'), comment: null },
        { id: 'sub-2', status: 'COMPLETED', accuracy: 80, submittedAt: new Date('2026-10-05'), comment: { content: 'Tốt', updatedAt: new Date('2026-10-06') } }
      ]);

      const result = await AssignmentQueryService.getStudentSubmissions('asg-1', 's-1', 'lecturer-1');

      assert.equal(result.student.fullName, 'Sinh vien A');
      assert.equal(result.canComment, true);
      assert.equal(result.submissions.length, 2);

      // Đảo ngược: bài nộp sau (sub-2) xếp trước, mang attemptNumber = 2
      assert.equal(result.submissions[0].id, 'sub-2');
      assert.equal(result.submissions[0].attemptNumber, 2);
      assert.equal(result.submissions[0].comment?.content, 'Tốt');

      // Bài nộp đầu (sub-1) xếp sau, mang attemptNumber = 1
      assert.equal(result.submissions[1].id, 'sub-1');
      assert.equal(result.submissions[1].attemptNumber, 1);
    });

    it('giá trị biên: canComment = false khi lớp học đã kết thúc (A17)', async () => {
      const endedAssignment = createMockAssignment({
        id: 'asg-1',
        class: { id: 'c-1', name: 'Lớp 1', status: 'ENDED', ownerId: 'lecturer-1', coLecturers: [] } as any
      });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => endedAssignment);
      mock.method(MemberRepository, 'findActiveMembership', async () => ({ id: 'mem-1' }));
      mock.method(SubmissionRepository, 'findStudentProfile', async () => ({ id: 's-1', username: 'SV A', studentCode: 'SE1' }));
      mock.method(SubmissionRepository, 'findStudentSubmissions', async () => [
        { id: 'sub-1', status: 'COMPLETED', accuracy: 70, submittedAt: new Date(), comment: null }
      ]);

      const result = await AssignmentQueryService.getStudentSubmissions('asg-1', 's-1', 'lecturer-1');
      assert.equal(result.canComment, false);
    });

    it('giá trị biên: canComment = false khi sinh viên đã rời khỏi lớp (membership = null - A18)', async () => {
      const assignment = createMockAssignment({
        class: { id: 'c-1', name: 'Lớp 1', status: 'ACTIVE', ownerId: 'lecturer-1', coLecturers: [] } as any
      });
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => assignment);
      // Sinh viên không còn trong lớp
      mock.method(MemberRepository, 'findActiveMembership', async () => null);
      mock.method(SubmissionRepository, 'findStudentProfile', async () => ({ id: 's-1', username: 'SV Đã Rời', studentCode: 'SE1' }));
      // Nhưng có bài nộp trong quá khứ
      mock.method(SubmissionRepository, 'findStudentSubmissions', async () => [
        { id: 'sub-old', status: 'COMPLETED', accuracy: 65, submittedAt: new Date(), comment: null }
      ]);

      const result = await AssignmentQueryService.getStudentSubmissions('asg-1', 's-1', 'lecturer-1');
      assert.equal(result.canComment, false);
      assert.equal(result.submissions.length, 1);
    });

    it('báo lỗi 404 khi sinh viên không tồn tại trong hệ thống', async () => {
      mock.method(AssignmentAccessService, 'assertOwnedAssignment', async () => createMockAssignment());
      mock.method(MemberRepository, 'findActiveMembership', async () => null);
      mock.method(SubmissionRepository, 'findStudentSubmissions', async () => []);
      mock.method(SubmissionRepository, 'findStudentProfile', async () => null);

      await assert.rejects(
        AssignmentQueryService.getStudentSubmissions('asg-1', 'non-existent-student', 'lecturer-1'),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 404 &&
          err.message === messages.STUDENT_NOT_FOUND
      );
    });
  });

  describe('listClassSheetMusic', () => {
    it('lấy danh sách bản nhạc theo classId (lấy instrumentId của lớp)', async () => {
      mock.method(ClassAccessService, 'assertOwnedClass', async () => ({
        id: 'c-1',
        instrumentId: 'inst-tranh'
      } as any));

      const sheetList = [{ id: 's-1', name: 'Lưu thủy', pieceTitle: 'Lưu thủy hành vân', bpm: 80, isAvailable: true }];
      mock.method(SubmissionRepository, 'findClassSheetMusic', async (instId: string) => {
        if (instId === 'inst-tranh') return sheetList;
        return [];
      });

      const result = await AssignmentQueryService.listClassSheetMusic({ classId: 'c-1' }, 'lecturer-1');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'Lưu thủy');
    });

    it('lấy danh sách bản nhạc trực tiếp theo instrumentId', async () => {
      const sheetList = [{ id: 's-2', name: 'Kim tiền', pieceTitle: 'Kim tiền Huế', bpm: 90, isAvailable: true }];
      mock.method(SubmissionRepository, 'findClassSheetMusic', async (instId: string) => {
        if (instId === 'inst-bau') return sheetList;
        return [];
      });

      const result = await AssignmentQueryService.listClassSheetMusic({ instrumentId: 'inst-bau' }, 'lecturer-1');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'Kim tiền');
    });
  });
});
