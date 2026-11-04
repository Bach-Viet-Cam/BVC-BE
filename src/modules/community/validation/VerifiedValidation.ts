import { z } from 'zod';

export default class VerifiedValidation {
  static readonly query = z.object({
    q: z.string().trim().max(200).default(''), cohort: z.string().trim().max(50).optional(),
    instrumentId: z.string().trim().min(1).max(64).optional(), sourceSheetMusicId: z.string().trim().min(1).max(64).optional(),
    status: z.enum(['ALL', 'VISIBLE', 'HIDDEN', 'REVOKED']).default('VISIBLE'),
    sortBy: z.enum(['verifiedAt', 'accuracy', 'pieceTitle', 'performer']).default('verifiedAt'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20)
  });
  static readonly reviewBody = z.object({ decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().max(2000).optional(), manual: z.boolean().default(false) }).strict()
    .refine((value) => value.decision !== 'REJECT' || Boolean(value.reason), { message: 'Vui lòng nhập lý do từ chối.', path: ['reason'] });
  static readonly mutationBody = z.object({ status: z.enum(['VISIBLE', 'HIDDEN']).optional(), reason: z.string().trim().max(2000).optional(), version: z.number().int().min(1) }).strict();
  static readonly id = z.object({ body: z.unknown(), params: z.object({ id: z.uuid() }), query: z.object({}) });
  static readonly consent = VerifiedValidation.id.extend({ body: z.object({ isGranted: z.boolean() }).strict() });
  static readonly review = VerifiedValidation.id.extend({ body: VerifiedValidation.reviewBody });
  static readonly mutation = VerifiedValidation.id.extend({ body: VerifiedValidation.mutationBody });
  static readonly list = z.object({ body: z.unknown(), params: z.object({}), query: VerifiedValidation.query });
  static readonly library = VerifiedValidation.list.extend({ params: z.object({ id: z.string().trim().min(1).max(64) }), query: VerifiedValidation.query.extend({ instrumentId: z.string().trim().min(1).max(64) }) });
}
