import type { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import VerifiedModel from '../model/VerifiedModel.ts';

type Record = Prisma.VerifiedContentGetPayload<{include: typeof VerifiedModel.include}>;

export default class VerifiedPolicyService {
  static canManage(actor: Backend.UserDTO, sourceClass: { ownerId: string; coLecturers: Array<{ lecturerId: string }> }): boolean {
    return actor.role === 3 || (actor.role === 2 && ClassAccessService.isClassLecturer(sourceClass, actor.userId));
  }
  static canPublish(row: Record): boolean {
    return row.status !== 'REVOKED' && row.submission.shareConsent && !row.submission.fileDeletedAt
      && row.piece.visibility === 'PUBLIC' && row.piece.moderation === 'NORMAL' && !row.piece.deletedAt
      && row.sourceSheetMusic.visibility === 'PUBLIC' && row.sourceSheetMusic.moderation === 'NORMAL'
      && row.instrument.isActive && !row.audioUpload.deletingAt;
  }
  static assertManage(actor: Backend.UserDTO, row: Record): void {
    if (!VerifiedPolicyService.canManage(actor, row.sourceClass)) throw AppError.forbidden();
  }
}
