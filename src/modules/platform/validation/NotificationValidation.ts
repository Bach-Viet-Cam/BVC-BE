import { z } from 'zod';
import PlatformConstant from '../constant/PlatformConstant.ts';

const noParams = z.object({});
const noQuery = z.object({});
const idParams = z.object({ id: z.string().min(1) });

const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    body: z.string().trim().min(1).max(2000),
    type: z.enum(['DEADLINE', 'ANNOUNCEMENT', 'SYSTEM', 'BONUS']),
    target: z.enum(['ALL', 'STUDENT', 'TEACHER']),
    scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
    action: z.enum(['draft', 'send'])
  })
  .strict();

export default class NotificationValidation {
  static readonly listSchema = z.object({
    body: z.unknown(),
    params: noParams,
    query: z.object({
      status: z.enum(['DRAFT', 'SCHEDULED', 'SENT']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(PlatformConstant.notification.maxPageSize).default(PlatformConstant.defaultPageSize)
    })
  });
  static readonly createSchema = z.object({ body: bodySchema, params: noParams, query: noQuery });
  static readonly updateSchema = z.object({ body: bodySchema, params: idParams, query: noQuery });
  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: noQuery });
  static readonly emptySchema = z.object({ body: z.unknown(), params: noParams, query: noQuery });
  static readonly myListSchema = z.object({
    body: z.unknown(),
    params: noParams,
    query: z.object({
      unreadOnly: z.enum(['true', 'false']).default('false').transform((flag) => flag === 'true'),
      type: z.enum(['DEADLINE', 'ANNOUNCEMENT', 'SYSTEM', 'BONUS']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(PlatformConstant.notification.maxPageSize).default(PlatformConstant.defaultPageSize)
    })
  });
}
