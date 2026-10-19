import { z } from 'zod';
import ClassesConstant from '../constant/ClassesConstant.ts';

export default class ProgressValidation {
  static readonly classListSchema = z.object({ body: z.unknown(), params: z.object({}), query: z.object({}) });
  static readonly progressSchema = z.object({
    body: z.unknown(),
    params: z.object({ classId: z.string().min(1) }),
    query: z.object({
      status: z.enum(ClassesConstant.progressStatuses).optional(),
      q: z.string().trim().max(100).optional(),
      sortBy: z.enum(['studentCode', 'username', 'averageAccuracy']).default('studentCode'),
      sortDir: z.enum(['asc', 'desc']).default('asc')
    })
  });
}
