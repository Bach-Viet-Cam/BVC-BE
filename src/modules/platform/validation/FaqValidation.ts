import { z } from 'zod';

export default class FaqValidation {
  static readonly topics = ['COURSE_RULES', 'ASSIGNMENTS', 'INSTRUMENTS', 'PLATFORM'] as const;
  static readonly input = z.object({
    question: z.string().trim().min(1, 'Vui lòng nhập câu hỏi.').max(300),
    answer: z.string().trim().min(1, 'Vui lòng nhập câu trả lời.').max(10000),
    topic: z.enum(FaqValidation.topics),
    instrumentId: z.string().trim().min(1).max(64).nullable().default(null),
    displayOrder: z.number().int().min(0).max(9999).default(0),
    isActive: z.boolean().default(true)
  }).strict();
  static readonly query = z.object({
    q: z.string().trim().max(300).default(''),
    topic: z.enum(FaqValidation.topics).optional(),
    instrumentId: z.string().trim().min(1).max(64).optional(),
    status: z.enum(['ALL', 'ACTIVE', 'HIDDEN']).default('ALL'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  });
  static readonly list = z.object({ body: z.unknown(), params: z.object({}), query: FaqValidation.query });
  static readonly create = z.object({ body: FaqValidation.input, params: z.object({}), query: z.object({}) });
  static readonly update = z.object({ body: FaqValidation.input.extend({
    instrumentId: z.string().trim().min(1).max(64).nullable().optional(),
    displayOrder: z.number().int().min(0).max(9999).optional(), isActive: z.boolean().optional()
  }).partial(), params: z.object({ id: z.uuid() }), query: z.object({}) });
  static readonly id = z.object({ body: z.unknown(), params: z.object({ id: z.uuid() }), query: z.object({}) });
}
