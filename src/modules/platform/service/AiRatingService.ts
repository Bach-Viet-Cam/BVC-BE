import type { z } from 'zod';
import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import AiRatingRepository from '../repository/AiRatingRepository.ts';
import AiRatingPolicyService from './AiRatingPolicyService.ts';
import AiRatingValidation from '../validation/AiRatingValidation.ts';

interface RatingState {
  feedback: string | null; feedbackKey: string | null; canComment: boolean; rating: Awaited<ReturnType<typeof AiRatingRepository.own>>;
}

export default class AiRatingService {
  static async get(actor: Backend.UserDTO, id: string, client: Prisma.TransactionClient = PrismaClientProvider.instance): Promise<RatingState> {
    const row = await AiRatingRepository.source(id, client);
    if (!row) throw AppError.notFound('Không tìm thấy bài nộp.');
    AiRatingPolicyService.assertAccess(actor, row);
    const feedback = AiRatingPolicyService.feedback(row);
    return { feedback: feedback?.text ?? null, feedbackKey: feedback?.key ?? null, canComment: actor.role === 2, rating: feedback ? await AiRatingRepository.own(id, actor.userId, feedback.key, client) : null };
  }
  static async save(actor: Backend.UserDTO, id: string, input: z.infer<typeof AiRatingValidation.input>): Promise<RatingState> {
    AiRatingPolicyService.assertComment(actor.role, input.comment);
    return PrismaClientProvider.instance.$transaction(async client => {
      await client.$queryRaw`SELECT id FROM submissions WHERE id = ${id} FOR UPDATE`;
      const current = await AiRatingService.get(actor, id, client);
      if (!current.feedback || current.feedbackKey !== input.feedbackKey) throw AppError.conflict('Phản hồi AI đã thay đổi hoặc chưa sẵn sàng. Vui lòng tải lại.');
      const rating = await AiRatingRepository.save({ submissionId: id, raterId: actor.userId, raterName: actor.username, raterRole: actor.role, feedbackKey: current.feedbackKey, feedbackText: current.feedback, accuracyStars: input.accuracyStars, satisfactionStars: input.satisfactionStars, comment: actor.role === 2 ? input.comment || null : null }, client);
      return { ...current, rating };
    });
  }
}
