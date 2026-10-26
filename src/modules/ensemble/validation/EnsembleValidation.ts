import { z } from 'zod';

export default class EnsembleValidation {
  static readonly tracksSchema = z.object({
    body: z.unknown(),
    params: z.object({ pieceId: z.string().min(1) }),
    query: z.object({ assignmentId: z.string().min(1).optional() })
  });
}
