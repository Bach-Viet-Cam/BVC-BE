import { z } from 'zod';

const noParams = z.object({});
const noQuery = z.object({});

export default class SystemConfigValidation {
  static readonly listSchema = z.object({
    body: z.unknown(),
    params: noParams,
    query: z.object({
      group: z.enum(['FILE_LIMIT', 'SCORING', 'PRACTICE_RULE']).optional(),
      q: z.string().trim().max(100).optional(),
      sortBy: z.enum(['label', 'group']).default('group'),
      sortDir: z.enum(['asc', 'desc']).default('asc')
    })
  });
  static readonly updateSchema = z.object({
    body: z.object({ value: z.string().max(1000) }).strict(),
    params: z.object({ id: z.string().min(1) }),
    query: noQuery
  });
}
