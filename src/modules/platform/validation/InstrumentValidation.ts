import { z } from 'zod';

const noParams = z.object({});
const noQuery = z.object({});
const idParams = z.object({ id: z.string().min(1) });
const nameSchema = z.string().trim().min(1).max(100);
const descriptionSchema = z.string().trim().max(255);

export default class InstrumentValidation {
  static readonly listSchema = z.object({
    body: z.unknown(),
    params: noParams,
    query: z.object({
      q: z.string().trim().max(100).optional(),
      status: z.enum(['active', 'inactive', 'all']).default('active'),
      sortBy: z.enum(['code', 'name']).default('name'),
      sortDir: z.enum(['asc', 'desc']).default('asc')
    })
  });
  static readonly createSchema = z.object({
    body: z.object({
      code: z.string().trim().toLowerCase().max(30).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      name: nameSchema,
      description: descriptionSchema.optional()
    }),
    params: noParams,
    query: noQuery
  });
  static readonly updateSchema = z.object({
    body: z.object({ name: nameSchema.optional(), description: descriptionSchema.nullable().optional() }).strict(),
    params: idParams,
    query: noQuery
  });
  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: noQuery });
}
