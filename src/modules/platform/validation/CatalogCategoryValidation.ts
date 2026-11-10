import { z } from 'zod';

const noParams = z.object({});
const noQuery = z.object({});
const idParams = z.object({ id: z.string().min(1) });
const typeSchema = z.enum(['GENRE', 'LEVEL']);
const nameSchema = z.string().trim().min(1, 'Vui lòng nhập tên danh mục').max(100, 'Tên tối đa 100 ký tự');
const descriptionSchema = z.string().trim().max(255, 'Mô tả tối đa 255 ký tự');
const displayOrderSchema = z.number().int().min(0).max(9999);

export default class CatalogCategoryValidation {
  static readonly listSchema = z.object({
    body: z.unknown(),
    params: noParams,
    query: z.object({
      type: typeSchema,
      q: z.string().trim().max(100).optional(),
      status: z.enum(['active', 'inactive', 'all']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50)
    })
  });

  static readonly createSchema = z.object({
    body: z.object({
      type: typeSchema,
      name: nameSchema,
      description: descriptionSchema.nullable().optional(),
      displayOrder: displayOrderSchema.optional()
    }).strict(),
    params: noParams,
    query: noQuery
  });

  static readonly updateSchema = z.object({
    body: z.object({
      name: nameSchema.optional(),
      description: descriptionSchema.nullable().optional(),
      displayOrder: displayOrderSchema.optional()
    }).strict(),
    params: idParams,
    query: noQuery
  });

  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: noQuery });
}
