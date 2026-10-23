import GradingSettingsService from '../../platform/service/GradingSettingsService.ts';
import ChallengeConstant from '../constant/ChallengeConstant.ts';
import ChallengeDTO from '../dto/ChallengeDTO.ts';
import ChallengeRepository from '../repository/ChallengeRepository.ts';
import ChallengeAccessService from './ChallengeAccessService.ts';

// Read side for the lecturer's own challenges.
export default class ChallengeQueryService {
  static async list(lecturerId: string, query: Backend.ChallengeListQuery): Promise<{ items: Backend.ChallengeDTO[]; pagination: Backend.PaginationMeta }> {
    const { records, total } = await ChallengeRepository.findByLecturer(lecturerId, query);
    const now = new Date();
    return { items: records.map((record) => ChallengeDTO.toDTO(record, now)), pagination: { page: query.page, limit: query.limit, total } };
  }

  static async get(lecturerId: string, challengeId: string): Promise<Backend.ChallengeDTO> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    return ChallengeDTO.toDTO(record);
  }

  static async getFormMeta(): Promise<Backend.ChallengeFormMeta> {
    const settings = await GradingSettingsService.getGradingSettings();
    return { defaultMinAccuracy: settings.minAccuracy, maxSubmissionsDefault: ChallengeConstant.limits.MAX_SUBMISSIONS_DEFAULT };
  }

  static async listReadyPieces(query: Backend.ChallengePieceQuery): Promise<{ items: Backend.ChallengePieceDTO[]; pagination: Backend.PaginationMeta }> {
    const items = await ChallengeRepository.findReadyPieces(query);
    return { items, pagination: { page: 1, limit: items.length, total: items.length } };
  }
}
