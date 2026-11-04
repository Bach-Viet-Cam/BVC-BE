import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import VerifiedDTO from '../dto/VerifiedDTO.ts';
import VerifiedModel from '../model/VerifiedModel.ts';
import VerifiedRepository from '../repository/VerifiedRepository.ts';
import VerifiedValidation from '../validation/VerifiedValidation.ts';
import VerifiedPolicyService from './VerifiedPolicyService.ts';
import VerifiedAudioService from './VerifiedAudioService.ts';
import SubmissionReviewService from './SubmissionReviewService.ts';

type Item = ReturnType<typeof VerifiedDTO.item>;

export default class VerifiedContentService {
  static async list(actor: Backend.UserDTO, query: z.infer<typeof VerifiedValidation.query>, pieceId?: string): Promise<{items: Item[]; total: number; page: number; pageSize: number}> {
    const where: Prisma.VerifiedContentWhereInput = pieceId ? { ...VerifiedModel.publicWhere, pieceId } : { ...(query.status === 'ALL' ? {} : { status: query.status }) };
    if (query.instrumentId) where.instrumentId = query.instrumentId;
    if (query.sourceSheetMusicId) where.sourceSheetMusicId = query.sourceSheetMusicId;
    if (query.cohort) where.cohort = query.cohort;
    if (query.q) where.OR = [{ piece: { title: { contains: query.q, mode: 'insensitive' } } }, { submission: { student: { username: { contains: query.q, mode: 'insensitive' } } } }];
    const orderBy: Prisma.VerifiedContentOrderByWithRelationInput = query.sortBy === 'pieceTitle' ? {piece: {title: query.sortDir}}
      : query.sortBy === 'performer' ? {submission: {student: {username: query.sortDir}}}
        : query.sortBy === 'accuracy' ? {accuracy: {sort: query.sortDir, nulls: 'last'}} : {verifiedAt: query.sortDir};
    const result = await VerifiedRepository.list(where, query.page, query.pageSize, orderBy);
    return { ...result, items: result.items.map((row) => VerifiedDTO.item(row, actor)) };
  }
  static async get(actor: Backend.UserDTO, id: string): Promise<Item> {
    const row = await VerifiedRepository.find(id);
    if (!row) throw AppError.notFound('Nội dung xác minh không tồn tại.');
    if (actor.role === 1 && !(row.status === 'VISIBLE' && VerifiedPolicyService.canPublish(row))) throw AppError.notFound();
    return VerifiedDTO.item(row, actor);
  }
  static async mutate(actor: Backend.UserDTO, id: string, input: z.infer<typeof VerifiedValidation.mutationBody>, revoke: boolean): Promise<Item> {
    await VerifiedRepository.locked(async (tx) => {
      const row = await VerifiedRepository.find(id, tx);
      if (!row) throw AppError.notFound('Nội dung xác minh không tồn tại.');
      VerifiedPolicyService.assertManage(actor, row);
      const status = revoke ? 'REVOKED' : input.status;
      if (!status) throw AppError.badRequest('Vui lòng chọn trạng thái.');
      if (row.status === status) return;
      if (row.version !== input.version) throw AppError.conflict('Nội dung đã thay đổi. Vui lòng tải lại.');
      if (row.status === 'REVOKED') throw AppError.conflict('Nội dung đã bị thu hồi, không thể hiển thị lại.');
      if (revoke && !input.reason) throw AppError.badRequest('Vui lòng nhập lý do thu hồi.');
      if (status === 'VISIBLE') {
        if (!VerifiedPolicyService.canPublish(row)) throw AppError.conflict('Chưa có đồng ý chia sẻ hoặc bản nhạc nguồn không khả dụng.');
        await VerifiedAudioService.resolve(row.audioUpload.key, row.audioUpload.provider);
      }
      await tx.verifiedContent.update({ where: { id }, data: { status, reason: input.reason ?? null, version: { increment: 1 } } });
      await tx.auditLog.create({ data: { actorId: actor.userId, action: `VERIFIED_${status}`, entityType: 'VerifiedContent', entityId: id, payload: { from: row.status, reason: input.reason ?? null } } });
      if (status !== 'VISIBLE') await NotificationService.notifyUsers(actor.userId, [row.submission.studentId], { title: status === 'REVOKED' ? 'Xác minh bản thu đã được thu hồi' : 'Bản thu tham khảo đã được ẩn', body: input.reason ?? 'Bản thu không còn xuất hiện trong học liệu.', link: `/practice/submissions/${row.submissionId}` }, tx);
    });
    return VerifiedContentService.get(actor, id);
  }
  static async audio(actor: Backend.UserDTO, id: string, submission: boolean): Promise<{path: string; contentType: string}> {
    if (submission) {
      const row = await VerifiedRepository.source(id);
      if (!row) throw AppError.notFound();
      SubmissionReviewService.assertRead(actor, row);
      if (row.fileDeletedAt || row.studentUpload?.deletingAt) throw AppError.notFound('Bản thu không khả dụng.');
      if (!row.studentUpload) {
        if (!row.fileUrl) throw AppError.notFound('Bản thu không khả dụng.');
        return VerifiedAudioService.legacy(row.fileUrl);
      }
      return { path: await VerifiedAudioService.resolve(row.studentUpload.key, row.studentUpload.provider), contentType: row.studentUpload.contentType };
    }
    const row = await VerifiedRepository.find(id);
    if (!row) throw AppError.notFound();
    const publicAccess = row.status === 'VISIBLE' && VerifiedPolicyService.canPublish(row);
    const privileged = actor.role === 3 || (actor.role === 2) || (actor.userId === row.submission.studentId);
    if (!publicAccess && !privileged) throw AppError.notFound();
    if (row.submission.fileDeletedAt || row.audioUpload.deletingAt) throw AppError.notFound();
    return { path: await VerifiedAudioService.resolve(row.audioUpload.key, row.audioUpload.provider), contentType: row.audioUpload.contentType };
  }
  static async isProtectedKey(key: string): Promise<boolean> {
    return (await PrismaClientProvider.instance.verifiedContent.count({ where: { audioUpload: { key } } })) > 0;
  }
}
