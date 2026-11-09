import { Prisma, type Faq } from '@prisma/client';
import type { z } from 'zod';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import FaqValidation from '../validation/FaqValidation.ts';
import FaqRepository from '../repository/FaqRepository.ts';
import FaqPolicyService from './FaqPolicyService.ts';

export default class FaqService {
  static async list(query: z.infer<typeof FaqValidation.query>, admin: boolean): Promise<{items: Faq[]; total: number; page: number; pageSize: number}> {
    const where: Prisma.FaqWhereInput = {
      ...(!admin || query.status === 'ACTIVE' ? { isActive: true } : query.status === 'HIDDEN' ? { isActive: false } : {}),
      ...(query.topic ? { topic: query.topic } : {}),
      ...(query.instrumentId ? { OR: [{ instrumentId: null }, { instrumentId: query.instrumentId }] } : {}),
      ...(query.q ? { AND: [{ OR: [{ question: { contains: query.q, mode: 'insensitive' } }, { answer: { contains: query.q, mode: 'insensitive' } }] }] } : {})
    };
    return FaqRepository.list(where, query.page, query.pageSize);
  }
  static async save(id: string | null, actorId: string, input: Partial<z.infer<typeof FaqValidation.input>>): Promise<Faq> {
    const previous = id ? await PrismaClientProvider.instance.faq.findUnique({ where: { id } }) : null;
    if (id && !previous) throw AppError.notFound('Câu hỏi không tồn tại.');
    const body = FaqValidation.input.parse({ ...(previous ? { question: previous.question, answer: previous.answer, topic: previous.topic, instrumentId: previous.instrumentId, displayOrder: previous.displayOrder, isActive: previous.isActive } : {}), ...input });
    if (body.instrumentId && body.instrumentId !== previous?.instrumentId) {
      const instrument = await PrismaClientProvider.instance.instrument.findFirst({ where: { id: body.instrumentId, isActive: true } });
      if (!instrument) throw AppError.badRequest('Nhạc cụ không còn hoạt động.');
    }
    try {
      return await FaqRepository.save(id, actorId, { ...body, questionKey: FaqPolicyService.questionKey(body.question), createdById: previous?.createdById ?? actorId, updatedById: actorId });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw AppError.conflict('Câu hỏi đã tồn tại trong chủ đề này.', { field: 'question' });
      throw error;
    }
  }
  static async remove(id: string, actorId: string): Promise<void> {
    try { await FaqRepository.remove(id, actorId); }
    catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw AppError.notFound('Câu hỏi không tồn tại.');
      throw error;
    }
  }
}
