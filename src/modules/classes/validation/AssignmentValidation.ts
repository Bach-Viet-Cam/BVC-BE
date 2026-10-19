import { z } from 'zod';

export default class AssignmentValidation {
  static readonly listMineSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({
      classId: z.string().min(1).optional(),
      status: z.enum(['PASSED', 'SUBMITTED', 'OVERDUE', 'NOT_SUBMITTED']).optional(),
      type: z.enum(['BONUS', 'NON_BONUS']).optional(),
      q: z.string().trim().max(100).optional(),
      sortBy: z.enum(['deadline', 'title']).default('deadline'),
      sortDir: z.enum(['asc', 'desc']).default('asc')
    })
  });
  static readonly detailSchema = z.object({ body: z.unknown(), params: z.object({ id: z.string().min(1) }), query: z.object({}) });
}
