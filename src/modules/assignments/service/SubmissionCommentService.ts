import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import SubmissionRepository from '../repository/SubmissionRepository.ts';

const messages = AssignmentConstant.messages;
const notifications = AssignmentConstant.notifications;

// One comment per submission; an update overwrites it. Only the first comment notifies (A6, A12).
export default class SubmissionCommentService {
  static async saveComment(submissionId: string, lecturerId: string, content: string): Promise<{ comment: Backend.SubmissionCommentDTO; message: string }> {
    const context = await SubmissionRepository.findSubmissionContext(submissionId);
    if (!context || context.assignment.deletedAt || context.assignment.class.lecturerId !== lecturerId) {
      throw AppError.notFound(messages.SUBMISSION_NOT_FOUND);
    }
    const membership = await MemberRepository.findActiveMembership(context.assignment.class.id, context.studentId);
    if (context.assignment.class.status !== 'ACTIVE' || !membership) {
      throw AppError.conflict(messages.COMMENT_LOCKED, { code: 'MSG-08' });
    }

    const isFirstComment = context.comment === null;
    const saved = await PrismaClientProvider.instance.$transaction(async (transaction) => {
      const comment = await SubmissionRepository.upsertComment(submissionId, lecturerId, content, transaction);
      if (isFirstComment) {
        await NotificationService.notifyUsers(
          [context.studentId],
          {
            title: notifications.COMMENTED_TITLE,
            body: notifications.body(context.assignment.class.name, context.assignment.currentVersion?.title ?? ''),
            link: notifications.link(context.assignmentId)
          },
          transaction
        );
      }
      return comment;
    });
    return {
      comment: { content: saved.content, updatedAt: saved.updatedAt.toISOString() },
      message: isFirstComment ? messages.COMMENT_SENT : messages.COMMENT_UPDATED
    };
  }
}
