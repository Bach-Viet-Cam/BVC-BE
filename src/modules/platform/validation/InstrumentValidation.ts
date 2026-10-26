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
      code: z.string().trim().toUpperCase().max(30).regex(/^[A-Z0-9_-]+$/),
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
  static readonly tunesSchema = z.object({
    body: z.object({
      tunes: z.array(z.object({
        tuneName: z.string().trim().min(1, 'Tên dây hoặc nốt không được để trống').max(50),
        pitch: z.number().positive('Cao độ chuẩn phải lớn hơn 0').max(10000),
        displayOrder: z.number().int().optional()
      })).max(40, 'Tối đa 40 dây hoặc nốt cho một nhạc cụ')
    }),
    params: idParams,
    query: noQuery
  });
}

