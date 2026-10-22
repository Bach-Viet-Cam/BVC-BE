import ChallengeConstant from '../constant/ChallengeConstant.ts';
import PieceUtil from '../../../utils/PieceUtil.ts';

interface DraftInput { title?: string | null; description?: string | null }
interface PublishInput extends DraftInput {
  instrumentId?: string | null;
  pieceId?: string | null;
  classIds?: string[] | null;
  weekStart?: string | null;
  requiredBpm?: number | null;
  minAccuracy?: number | null;
  maxSubmissions?: number | null;
}
interface PieceState { visibility: string; moderation: string; deletedAt: Date | null }
interface SheetState { visibility: string; moderation: string; referenceAudioId: string | null; analysisStatus: string }
type DisplayStatus = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'ENDED';
type RequiredField = 'instrumentId' | 'pieceId' | 'classIds' | 'weekStart';

export default class ChallengeRules {
  static validateDraft(input: DraftInput): Backend.FieldError[] {
    return [...ChallengeRules.checkTitle(input.title), ...ChallengeRules.checkDescription(input.description)];
  }

  static validatePublish(input: PublishInput): Backend.FieldError[] {
    const labels = ChallengeConstant.fieldLabels;
    const limits = ChallengeConstant.limits;
    return [
      ...ChallengeRules.validateDraft(input),
      ...ChallengeRules.requireValue('instrumentId', Boolean(input.instrumentId)),
      ...ChallengeRules.requireValue('pieceId', Boolean(input.pieceId)),
      ...ChallengeRules.requireValue('classIds', Boolean(input.classIds && input.classIds.length > 0)),
      ...ChallengeRules.requireValue('weekStart', Boolean(input.weekStart)),
      ...ChallengeRules.checkRange('requiredBpm', labels.requiredBpm, input.requiredBpm, limits.BPM_MIN, limits.BPM_MAX),
      ...ChallengeRules.checkRange('minAccuracy', labels.minAccuracy, input.minAccuracy, limits.ACCURACY_MIN, limits.ACCURACY_MAX),
      ...ChallengeRules.checkRange('maxSubmissions', labels.maxSubmissions, input.maxSubmissions, 1, ChallengeConstant.maxSubmissionsCap)
    ];
  }

  static displayStatus(challenge: { status: 'DRAFT' | 'PUBLISHED'; startsAt: Date | null; endsAt: Date | null }, now: Date): DisplayStatus {
    if (challenge.status === 'DRAFT' || !challenge.startsAt || !challenge.endsAt) return 'DRAFT';
    if (now.getTime() < challenge.startsAt.getTime()) return 'UPCOMING';
    if (now.getTime() > challenge.endsAt.getTime()) return 'ENDED';
    return 'ACTIVE';
  }

  static isPieceReady(piece: PieceState, mainSheet: SheetState | null): boolean {
    if (!PieceUtil.isAvailable(piece) || !mainSheet) return false;
    const isSheetAvailable = mainSheet.visibility === 'PUBLIC' && mainSheet.moderation === 'NORMAL';
    return isSheetAvailable && Boolean(mainSheet.referenceAudioId) && mainSheet.analysisStatus === 'READY';
  }

  static overlaps(first: string[], second: string[]): boolean {
    const secondIds = new Set(second);
    return first.some((id) => secondIds.has(id));
  }

  private static checkTitle(title: string | null | undefined): Backend.FieldError[] {
    const label = ChallengeConstant.fieldLabels.title;
    if (!title || title.trim().length === 0) return [{ field: 'title', code: 'MSG-35', message: ChallengeConstant.messages.required(label) }];
    if (title.length > ChallengeConstant.limits.TITLE_MAX) {
      return [{ field: 'title', code: 'MSG-37', message: ChallengeConstant.messages.tooLong(label, ChallengeConstant.limits.TITLE_MAX) }];
    }
    return [];
  }

  private static checkDescription(description: string | null | undefined): Backend.FieldError[] {
    if (!description || description.length <= ChallengeConstant.limits.DESCRIPTION_MAX) return [];
    const message = ChallengeConstant.messages.tooLong(ChallengeConstant.fieldLabels.description, ChallengeConstant.limits.DESCRIPTION_MAX);
    return [{ field: 'description', code: 'MSG-37', message }];
  }

  private static requireValue(field: RequiredField, isPresent: boolean): Backend.FieldError[] {
    if (isPresent) return [];
    return [{ field, code: 'MSG-35', message: ChallengeConstant.messages.required(ChallengeConstant.fieldLabels[field]) }];
  }

  private static checkRange(field: string, label: string, value: number | null | undefined, min: number, max: number): Backend.FieldError[] {
    if (value === null || value === undefined) return [];
    if (Number.isFinite(value) && value >= min && value <= max) return [];
    return [{ field, code: 'MSG-03', message: ChallengeConstant.messages.outOfRange(label, min, max) }];
  }
}
