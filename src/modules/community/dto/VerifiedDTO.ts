import type { Prisma } from '@prisma/client';
import VerifiedModel from '../model/VerifiedModel.ts';
import VerifiedPolicyService from '../service/VerifiedPolicyService.ts';

type Record = Prisma.VerifiedContentGetPayload<{include: typeof VerifiedModel.include}>;
interface VerifiedItem {
  id: string; submissionId: string; pieceId: string; pieceTitle: string; sourceSheetMusicId: string;
  instrument: {id: string; name: string}; performerDisplayName: string; cohort: string; sourceClassName: string;
  accuracy: number | null; tempoDeviation: number | null; verifiedByDisplayName: string; verifiedAt: Date;
  status: string; version: number; reason: string | null; shareConsent: boolean; canHide: boolean; canShow: boolean; canRevoke: boolean;
}
export default class VerifiedDTO {
  static item(row: Record, actor: Backend.UserDTO): VerifiedItem {
    const canManage = VerifiedPolicyService.canManage(actor, row.sourceClass.ownerId);
    return {
      id: row.id, submissionId: row.submissionId, pieceId: row.pieceId, pieceTitle: row.piece.title, sourceSheetMusicId: row.sourceSheetMusicId,
      instrument: { id: row.instrumentId, name: row.instrument.name }, performerDisplayName: row.submission.student.username,
      cohort: row.cohort, sourceClassName: row.sourceClassName, accuracy: row.accuracy, tempoDeviation: row.tempoDeviation,
      verifiedByDisplayName: row.verifiedByName, verifiedAt: row.verifiedAt, status: row.status, version: row.version,
      reason: actor.role === 1 ? null : row.reason, shareConsent: row.submission.shareConsent,
      canHide: canManage && row.status === 'VISIBLE', canShow: canManage && row.status === 'HIDDEN' && VerifiedPolicyService.canPublish(row),
      canRevoke: canManage && row.status !== 'REVOKED'
    };
  }
}
