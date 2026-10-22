import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import ChallengeConstant from '../constant/ChallengeConstant.ts';
import ChallengeRepository from '../repository/ChallengeRepository.ts';
import ChallengeRules from './ChallengeRules.ts';
import ChallengeWeekCalculator from './ChallengeWeekCalculator.ts';

const messages = ChallengeConstant.messages;

// Checks that the week, classes and piece picked for a challenge are valid for this lecturer.
export default class ChallengeReferenceService {
  static assertWeek(weekStart: string | null | undefined, now: Date): void {
    if (!weekStart) return;
    if (!ChallengeWeekCalculator.isMonday(weekStart)) {
      throw AppError.fieldError(400, { field: 'weekStart', code: 'MSG-08', message: messages.WEEK_NOT_MONDAY });
    }
    if (ChallengeWeekCalculator.isPastWeek(weekStart, now)) {
      throw AppError.fieldError(400, { field: 'weekStart', code: 'MSG-04', message: messages.WEEK_IN_PAST });
    }
  }

  // Classes must belong to the lecturer (404 otherwise), be active (409) and share the challenge instrument (400).
  static async assertClasses(
    classIds: string[],
    instrumentId: string | null,
    lecturerId: string,
    options: { requireStudents: boolean }
  ): Promise<Backend.ClassRecord[]> {
    const classes: Backend.ClassRecord[] = [];
    for (const classId of classIds) {
      const classRecord = await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });
      if (instrumentId && classRecord.instrumentId !== instrumentId) {
        throw AppError.fieldError(400, { field: 'classIds', message: messages.CLASS_INSTRUMENT_MISMATCH });
      }
      if (options.requireStudents && (await MemberRepository.findActiveMemberIds(classId, PrismaClientProvider.instance)).size === 0) {
        throw AppError.conflict(messages.CLASS_EMPTY, { code: 'MSG-08' });
      }
      classes.push(classRecord);
    }
    return classes;
  }

  // Returns the main sheet used by the challenge, or null for a draft that has no instrument yet.
  static async assertPiece(pieceId: string | null, instrumentId: string | null, options: { requireReady: boolean }): Promise<string | null> {
    if (!pieceId) return null;
    const piece = await ChallengeRepository.findPieceForChallenge(pieceId, instrumentId);
    const isPlayable = piece !== null && piece.deletedAt === null && piece.visibility === 'PUBLIC' && piece.moderation === 'NORMAL';
    if (!piece || !isPlayable || (instrumentId && !piece.instruments.some((item) => item.instrumentId === instrumentId))) {
      throw AppError.fieldError(400, { field: 'pieceId', code: 'MSG-48', message: messages.PIECE_UNAVAILABLE });
    }
    const mainSheet = piece.sheetMusic[0] ?? null;
    if (options.requireReady && !ChallengeRules.isPieceReady(piece, mainSheet)) {
      throw AppError.fieldError(400, { field: 'pieceId', code: 'MSG-48', message: messages.PIECE_NOT_READY });
    }
    return mainSheet?.id ?? null;
  }
}
