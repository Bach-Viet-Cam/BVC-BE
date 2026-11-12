import { z } from 'zod';

export default class AiRatingValidation {
  static readonly input = z.object({
    feedbackKey: z.string().regex(/^[a-f0-9]{64}$/),
    accuracyStars: z.number().int().min(1).max(5),
    satisfactionStars: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).nullable().optional()
  }).strict();
  static readonly id = z.object({ params: z.object({ id: z.string().trim().min(1).max(64) }), body: z.unknown(), query: z.object({}) });
  static readonly save = AiRatingValidation.id.extend({ body: AiRatingValidation.input });
  static readonly list = z.object({ body: z.unknown(), params: z.object({}), query: z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    role: z.enum(['ALL', 'STUDENT', 'LECTURER']).default('ALL')
  }) });
}
