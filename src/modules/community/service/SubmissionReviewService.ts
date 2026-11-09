import type { Prisma, SubmissionReview } from '@prisma/client';
import type { z } from 'zod';
import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import VerifiedModel from '../model/VerifiedModel.ts';
import VerifiedRepository from '../repository/VerifiedRepository.ts';
import VerifiedValidation from '../validation/VerifiedValidation.ts';
import VerifiedAudioService from './VerifiedAudioService.ts';

type Source = Prisma.SubmissionGetPayload<{ include: typeof VerifiedModel.sourceInclude }>;
interface ReviewState { review: SubmissionReview | null; shareConsent: boolean; canReview: boolean; verifiedContentId: string | null }

export default class SubmissionReviewService {
  static assertRead(actor: Backend.UserDTO, row: Source): void {
    if (actor.role === 3 || (actor.role === 1 && row.studentId === actor.userId) || (actor.role === 2 && (row.assignment ? ClassAccessService.isClassLecturer(row.assignment.class, actor.userId) : false))) return;
    throw AppError.forbidden();
  }
  static async get(actor: Backend.UserDTO, id: string): Promise<ReviewState> {
    const row = await VerifiedRepository.source(id);
    if (!row) throw AppError.notFound('Bài nộp không tồn tại.');
    SubmissionReviewService.assertRead(actor, row);
    return { review: row.review, shareConsent: row.shareConsent, canReview: actor.role === 2 && (row.assignment ? ClassAccessService.isClassLecturer(row.assignment.class, actor.userId) : false) && !row.review && row.status !== 'PROCESSING' && !row.fileDeletedAt && Boolean(row.studentUpload), verifiedContentId: row.verifiedContent?.id ?? null };
  }
  static async consent(actor: Backend.UserDTO, id: string, isGranted: boolean): Promise<ReviewState> {
    await VerifiedRepository.locked(async (tx) => {
      const row = await VerifiedRepository.source(id, tx);
      if (!row) throw AppError.notFound('Bài nộp không tồn tại.');
      if (actor.role !== 1 || actor.userId !== row.studentId) throw AppError.forbidden();
      if (row.shareConsent === isGranted) return;
      await tx.submission.update({ where: { id }, data: { shareConsent: isGranted, consentUpdatedAt: new Date() } });
      if (!isGranted) await tx.verifiedContent.updateMany({ where: { submissionId: id, status: 'VISIBLE' }, data: { status: 'HIDDEN', version: { increment: 1 }, reason: 'Sinh viên đã rút đồng ý chia sẻ.' } });
      await tx.auditLog.create({ data: { actorId: actor.userId, action: isGranted ? 'SHARING_GRANTED' : 'SHARING_WITHDRAWN', entityType: 'Submission', entityId: id } });
    });
    return SubmissionReviewService.get(actor, id);
  }
  static async decide(actor: Backend.UserDTO, id: string, input: z.infer<typeof VerifiedValidation.reviewBody>): Promise<ReviewState> {
    await VerifiedRepository.locked(async (tx) => {
      const row = await VerifiedRepository.source(id, tx);
      if (!row) throw AppError.notFound('Bài nộp không tồn tại.');
      if (actor.role !== 2 || !row.assignment || !ClassAccessService.isClassLecturer(row.assignment.class, actor.userId)) throw AppError.forbidden();
      const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      if (row.review) {
        if (row.review.status === status) return;
        throw AppError.conflict('Bài nộp đã có quyết định xét duyệt.');
      }
      if (row.status === 'PROCESSING') throw AppError.conflict('Bản thu đang được phân tích. Vui lòng chờ.');
      if (status === 'APPROVED') {
        if (row.status !== 'COMPLETED' && !input.manual) throw AppError.conflict('Vui lòng xác nhận xét duyệt thủ công khi chưa có kết quả AI.');
        const sheet = row.sheetMusic;
        if (!sheet || sheet.pieceId !== row.pieceId || (row.assignmentVersion?.sheetMusicId && row.assignmentVersion.sheetMusicId !== sheet.id)) throw AppError.conflict('Không xác định được bản nhạc nguồn của bài nộp.');
        if (row.fileDeletedAt || !row.studentUpload || row.studentUpload.deletingAt) throw AppError.conflict('File bản thu không còn khả dụng.');
        const otherProcessing = await tx.submission.count({ where: { studentUploadId: row.studentUpload.id, id: { not: id }, status: 'PROCESSING' } });
        const evaluationReferences = await tx.audioEvaluationRequest.count({ where: { OR: [{ studentUploadId: row.studentUpload.id }, { templateUploadId: row.studentUpload.id }] } });
        if (otherProcessing || evaluationReferences) throw AppError.conflict('File đang được dùng bởi luồng phân tích khác. Vui lòng dùng bản tải lên riêng trước khi xác minh.');
        await VerifiedAudioService.resolve(row.studentUpload.key, row.studentUpload.provider);
        const visible = row.shareConsent && sheet.visibility === 'PUBLIC' && sheet.moderation === 'NORMAL'
          && sheet.piece.visibility === 'PUBLIC' && sheet.piece.moderation === 'NORMAL' && !sheet.piece.deletedAt && sheet.instrument.isActive;
        await tx.verifiedContent.create({ data: {
          submissionId: id, pieceId: row.pieceId, sourceSheetMusicId: sheet.id, instrumentId: sheet.instrumentId,
          sourceClassId: row.assignment!.classId, sourceClassName: row.assignment!.class.name, cohort: row.assignment!.class.cohort,
          verifiedById: actor.userId, verifiedByName: actor.username, accuracy: row.accuracy, tempoDeviation: row.tempoDeviation,
          audioUploadId: row.studentUpload.id, status: visible ? 'VISIBLE' : 'HIDDEN'
        } });
      }
      await tx.submissionReview.create({ data: { submissionId: id, status, reviewedById: actor.userId, reason: input.reason ?? null } });
      await tx.auditLog.create({ data: { actorId: actor.userId, action: `SUBMISSION_${status}`, entityType: 'Submission', entityId: id, payload: { reason: input.reason ?? null } } });
      await NotificationService.notifyUsers(actor.userId, [row.studentId], {
        title: status === 'APPROVED' ? 'Bản thu đã được xác minh' : 'Bản thu chưa được duyệt',
        body: status === 'APPROVED' ? (row.shareConsent ? 'Giảng viên đã xác minh bản thu. Bản thu sẽ hiển thị khi bài nhạc nguồn cho phép chia sẻ.' : 'Giảng viên đã xác minh. Bản thu chưa được chia sẻ vì bạn chưa đồng ý.') : input.reason!,
        link: `/practice/submissions/${id}`
      }, tx);
    });
    return SubmissionReviewService.get(actor, id);
  }
}
