import { z } from 'zod';
import PlatformConstant from '../constant/PlatformConstant.ts';

const noParams = z.object({});
const noQuery = z.object({});
const idParams = z.object({ id: z.string().min(1) });
const roleSchema = z.number().int().min(1).max(3);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(100));
const usernameSchema = z.string().trim().min(1).max(100);
const studentCodeSchema = z.string().trim().min(1).max(20);

export default class UserValidation {
  static readonly listSchema = z.object({
    body: z.unknown(),
    params: noParams,
    query: z.object({
      role: z.coerce.number().int().min(1).max(3).optional(),
      status: z.enum(PlatformConstant.userStatuses).optional(),
      q: z.string().trim().max(100).optional(),
      sortBy: z.enum(['username', 'email', 'role', 'status']).default('username'),
      sortDir: z.enum(['asc', 'desc']).default('asc'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(PlatformConstant.maxPageSize).default(PlatformConstant.defaultPageSize)
    })
  });
  static readonly createSchema = z.object({
    body: z.object({ email: emailSchema, username: usernameSchema, role: roleSchema, studentCode: studentCodeSchema.optional() }),
    params: noParams,
    query: noQuery
  });
  static readonly updateSchema = z.object({
    body: z.object({ email: emailSchema.optional(), username: usernameSchema.optional(), role: roleSchema.optional(), studentCode: studentCodeSchema.nullable().optional() }),
    params: idParams,
    query: noQuery
  });
  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: noQuery });
}
