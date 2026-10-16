import { z } from 'zod';

export default class EnsembleValidation {
  static readonly tracksSchema = z.object({
    body: z.unknown(),
    params: z.object({ pieceId: z.string().min(1) }),
    query: z.object({ assignmentId: z.string().min(1).optional() })
  });
  static readonly createSessionSchema = z.object({
    body: z.object({
      pieceId: z.string().min(1),
      assignmentId: z.string().min(1).optional(),
      trackSettings: z.string().default('[]')
    }),
    params: z.object({}),
    query: z.object({})
  });
  static readonly sessionSchema = z.object({ body: z.unknown(), params: z.object({ id: z.string().min(1) }), query: z.object({}) });
}
