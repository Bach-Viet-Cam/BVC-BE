import { z } from 'zod';
import LeaderboardConstant from '../constant/LeaderboardConstant.ts';

const messages = LeaderboardConstant.messages;
const paging = LeaderboardConstant.paging;

export default class LeaderboardValidation {
  static readonly currentSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({
      category: z.enum(LeaderboardConstant.categories, { error: messages.CATEGORY_INVALID }).default('overall'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(paging.MAX_LIMIT).default(paging.DEFAULT_LIMIT),
      semester: z.string().trim().min(1, messages.SEMESTER_INVALID).max(50, messages.SEMESTER_INVALID).optional()
    })
  });

  static readonly refreshSchema = z.object({ body: z.unknown(), params: z.object({}), query: z.object({}) });
}
