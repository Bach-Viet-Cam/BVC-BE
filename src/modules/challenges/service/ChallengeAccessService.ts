import AppError from '../../../utils/AppError.ts';
import ChallengeConstant from '../constant/ChallengeConstant.ts';
import ChallengeRepository from '../repository/ChallengeRepository.ts';

// Ownership (GBR-01): another lecturer's challenge answers 404 so its existence is not leaked.
export default class ChallengeAccessService {
  static async assertOwnedChallenge(challengeId: string, lecturerId: string): Promise<Backend.ChallengeRecord> {
    const record = await ChallengeRepository.findById(challengeId);
    if (!record || record.createdById !== lecturerId) throw AppError.notFound(ChallengeConstant.messages.CHALLENGE_NOT_FOUND);
    return record;
  }

  static assertDraft(record: Backend.ChallengeRecord, action: string): void {
    if (record.status !== 'DRAFT') throw AppError.conflict(ChallengeConstant.messages.NOT_DRAFT(action), { code: 'MSG-08' });
  }
}
