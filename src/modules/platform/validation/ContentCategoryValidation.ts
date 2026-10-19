import { z } from 'zod';

const noParams = z.object({});
const noQuery = z.object({});
const idParams = z.object({ id: z.string().min(1) });
const nameSchema = z.string().trim().min(1).max(100);

export default class ContentCategoryValidation {
  static readonly emptySchema = z.object({ body: z.unknown(), params: noParams, query: noQuery });
  static readonly createSchema = z.object({
    body: z.object({ name: nameSchema, parentId: z.string().min(1).nullable().optional() }).strict(),
    params: noParams,
    query: noQuery
  });
  static readonly updateSchema = z.object({
    body: z.object({ name: nameSchema }).strict(),
    params: idParams,
    query: noQuery
  });
  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: noQuery });
}
