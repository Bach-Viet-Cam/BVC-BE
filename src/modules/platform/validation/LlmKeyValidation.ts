import { z } from 'zod';

export default class LlmKeyValidation {
  static readonly name = z.string().trim().min(1, 'Vui lòng nhập tên API key.').max(100, 'Tên API key tối đa 100 ký tự.');
  static readonly key = z.string().trim().min(10, 'API key không hợp lệ.').max(512, 'API key không hợp lệ.');
  // Upstream row: unknown fields are stripped by the schema (non-strict object)
  static readonly item = z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['active', 'disabled', 'invalid']),
    cooldownUntil: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    lastErrorCode: z.string().nullable(),
    successCount: z.number(),
    failCount: z.number(),
    createdAt: z.string()
  });
  static readonly list = z.object({ items: z.array(LlmKeyValidation.item) });
  static readonly createBody = z.object({ name: LlmKeyValidation.name, key: LlmKeyValidation.key }).strict();
  static readonly updateBody = z.object({
    name: LlmKeyValidation.name.optional(),
    status: z.enum(['active', 'disabled']).optional(),
    key: LlmKeyValidation.key.optional()
  }).strict().refine((body) => Object.keys(body).length > 0, 'Vui lòng nhập ít nhất một trường cần cập nhật.');
  static readonly create = z.object({ body: LlmKeyValidation.createBody, params: z.object({}), query: z.object({}) });
  static readonly update = z.object({ body: LlmKeyValidation.updateBody, params: z.object({ id: z.string().trim().min(1).max(64) }), query: z.object({}) });
  static readonly id = z.object({ body: z.unknown(), params: z.object({ id: z.string().trim().min(1).max(64) }), query: z.object({}) });
  static readonly listRequest = z.object({ body: z.unknown(), params: z.object({}), query: z.object({}) });
}
