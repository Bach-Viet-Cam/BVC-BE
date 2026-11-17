import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AiRatingModel from '../model/AiRatingModel.ts';

export default class AiRatingRepository {
  static async source(id: string, client: Prisma.TransactionClient = PrismaClientProvider.instance): Promise<Prisma.SubmissionGetPayload<{include: typeof AiRatingModel.sourceInclude}> | null> {
    return client.submission.findUnique({ where: { id }, include: AiRatingModel.sourceInclude });
  }
  static async own(submissionId: string, raterId: string, feedbackKey: string, client: Prisma.TransactionClient = PrismaClientProvider.instance): Promise<Prisma.AiFeedbackRatingGetPayload<{select: typeof AiRatingModel.ratingSelect}> | null> {
    return client.aiFeedbackRating.findUnique({ where: { submissionId_raterId_feedbackKey: { submissionId, raterId, feedbackKey } }, select: AiRatingModel.ratingSelect });
  }
  static async save(data: Prisma.AiFeedbackRatingUncheckedCreateInput, client: Prisma.TransactionClient): Promise<Prisma.AiFeedbackRatingGetPayload<{select: typeof AiRatingModel.ratingSelect}>> {
    return client.aiFeedbackRating.upsert({
      where: { submissionId_raterId_feedbackKey: { submissionId: data.submissionId, raterId: data.raterId, feedbackKey: data.feedbackKey } },
      create: data, update: { accuracyStars: data.accuracyStars, satisfactionStars: data.satisfactionStars, comment: data.comment, raterName: data.raterName, raterRole: data.raterRole }, select: AiRatingModel.ratingSelect
    });
  }
  static async history(page: number, role: 'ALL' | 'STUDENT' | 'LECTURER'): Promise<{items: Prisma.AiFeedbackRatingGetPayload<{include: typeof AiRatingModel.historyInclude}>[]; total: number; page: number; pageSize: number}> {
    const where = role === 'ALL' ? {} : { raterRole: role === 'STUDENT' ? 1 : 2 };
    const [items, total] = await PrismaClientProvider.instance.$transaction([
      PrismaClientProvider.instance.aiFeedbackRating.findMany({ where, include: AiRatingModel.historyInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 }),
      PrismaClientProvider.instance.aiFeedbackRating.count({ where })
    ]);
    return { items, total, page, pageSize: 20 };
  }
}
