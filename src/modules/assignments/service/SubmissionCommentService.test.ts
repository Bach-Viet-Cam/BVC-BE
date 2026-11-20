import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import SubmissionRepository from '../repository/SubmissionRepository.ts';
import SubmissionCommentService from './SubmissionCommentService.ts';

const messages = AssignmentConstant.messages;
const notifications = AssignmentConstant.notifications;

describe('SubmissionCommentService (Giảng viên nhận xét bài nộp)', () => {
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

  function createMockContext(overrides: any = {}) {
    return {
      assignmentId: 'asg-1',
      studentId: 'student-1',
      comment: null,
      assignment: {
        deletedAt: null,
        currentVersion: { title: 'Bài tập 1' },
        class: {
          id: 'class-1',
          name: 'TRN101.1',
          status: 'ACTIVE',
          ownerId: 'lecturer-1',
          coLecturers: []
        }
      },
      ...overrides
    };
  }

  it('lưu nhận xét lần đầu tiên: gửi thông báo tới sinh viên và trả về thông báo đã gửi', async () => {
    const context = createMockContext({ comment: null });
    mock.method(SubmissionRepository, 'findSubmissionContext', async () => context);
    mock.method(ClassAccessService, 'isClassLecturer', () => true);
    mock.method(MemberRepository, 'findActiveMembership', async () => ({ id: 'mem-1' }));

    const upsertMock = mock.method(SubmissionRepository, 'upsertComment', async () => ({
      content: 'Bài chơi tốt, cần chú ý nhịp phách',
      updatedAt: new Date('2026-10-15T12:00:00.000Z')
    }));
    const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

    const result = await SubmissionCommentService.saveComment('sub-1', 'lecturer-1', 'Bài chơi tốt, cần chú ý nhịp phách');

    assert.equal(upsertMock.mock.callCount(), 1);
    assert.equal(notifyMock.mock.callCount(), 1);
    assert.deepEqual(notifyMock.mock.calls[0].arguments[1], ['student-1']);
    assert.equal(notifyMock.mock.calls[0].arguments[2].title, notifications.COMMENTED_TITLE);
    assert.equal(result.message, messages.COMMENT_SENT);
    assert.equal(result.comment.content, 'Bài chơi tốt, cần chú ý nhịp phách');
  });

  it('chỉnh sửa nhận xét đã có: cập nhật nội dung và KHÔNG gửi lại thông báo', async () => {
    const context = createMockContext({
      comment: { id: 'com-1', content: 'Nhận xét ban đầu', updatedAt: new Date() }
    });
    mock.method(SubmissionRepository, 'findSubmissionContext', async () => context);
    mock.method(ClassAccessService, 'isClassLecturer', () => true);
    mock.method(MemberRepository, 'findActiveMembership', async () => ({ id: 'mem-1' }));
    mock.method(SubmissionRepository, 'upsertComment', async () => ({
      content: 'Nhận xét đã sửa',
      updatedAt: new Date('2026-10-15T13:00:00.000Z')
    }));
    const notifyMock = mock.method(NotificationService, 'notifyUsers', async () => {});

    const result = await SubmissionCommentService.saveComment('sub-1', 'lecturer-1', 'Nhận xét đã sửa');

    assert.equal(notifyMock.mock.callCount(), 0); // sửa nhận xét không gửi lại thông báo
    assert.equal(result.message, messages.COMMENT_UPDATED);
    assert.equal(result.comment.content, 'Nhận xét đã sửa');
  });

  it('báo lỗi 404 SUBMISSION_NOT_FOUND khi bài nộp không tồn tại hoặc giảng viên không phụ trách lớp', async () => {
    mock.method(SubmissionRepository, 'findSubmissionContext', async () => null);

    await assert.rejects(
      SubmissionCommentService.saveComment('non-existent-sub', 'lecturer-1', 'Nội dung'),
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 404 &&
        err.message === messages.SUBMISSION_NOT_FOUND
    );
  });

  it('báo lỗi 409 MSG-08 COMMENT_LOCKED khi lớp học đã kết thúc', async () => {
    const endedContext = createMockContext({
      assignment: {
        ...createMockContext().assignment,
        class: { ...createMockContext().assignment.class, status: 'ENDED' }
      }
    });
    mock.method(SubmissionRepository, 'findSubmissionContext', async () => endedContext);
    mock.method(ClassAccessService, 'isClassLecturer', () => true);
    mock.method(MemberRepository, 'findActiveMembership', async () => ({ id: 'mem-1' }));

    await assert.rejects(
      SubmissionCommentService.saveComment('sub-1', 'lecturer-1', 'Nhận xét'),
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 409 &&
        err.code === 'MSG-08' &&
        err.message === messages.COMMENT_LOCKED
    );
  });

  it('báo lỗi 409 MSG-08 COMMENT_LOCKED khi sinh viên không còn là thành viên hoạt động trong lớp', async () => {
    const context = createMockContext();
    mock.method(SubmissionRepository, 'findSubmissionContext', async () => context);
    mock.method(ClassAccessService, 'isClassLecturer', () => true);
    // Sinh viên đã bị xóa khỏi lớp
    mock.method(MemberRepository, 'findActiveMembership', async () => null);

    await assert.rejects(
      SubmissionCommentService.saveComment('sub-1', 'lecturer-1', 'Nhận xét'),
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 409 &&
        err.code === 'MSG-08' &&
        err.message === messages.COMMENT_LOCKED
    );
  });

  describe('Giá trị biên (Boundary cases)', () => {
    it('nhận xét với độ dài tối đa 2000 ký tự', async () => {
      const context = createMockContext();
      mock.method(SubmissionRepository, 'findSubmissionContext', async () => context);
      mock.method(ClassAccessService, 'isClassLecturer', () => true);
      mock.method(MemberRepository, 'findActiveMembership', async () => ({ id: 'mem-1' }));

      const maxContent = 'a'.repeat(2000);
      const upsertMock = mock.method(SubmissionRepository, 'upsertComment', async () => ({
        content: maxContent,
        updatedAt: new Date()
      }));
      mock.method(NotificationService, 'notifyUsers', async () => {});

      const result = await SubmissionCommentService.saveComment('sub-1', 'lecturer-1', maxContent);
      assert.equal(upsertMock.mock.calls[0].arguments[2].length, 2000);
      assert.equal(result.comment.content.length, 2000);
    });
  });
});
