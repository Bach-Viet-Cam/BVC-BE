import { z } from 'zod';

// Seeded pieces and assignments use readable ids, so these are not restricted to UUIDs
const recordId = z.string().trim().min(1).max(64);

export default class PracticeValidation {
  readonly createSchema = z.object({
    body: z.object({ pieceId: recordId, sheetMusicId: recordId, assignmentId: recordId.optional(), studentUploadId: z.uuid() }).strict(),
    params: z.object({}), query: z.object({})
  });

  readonly idSchema = z.object({ body: z.unknown(), params: z.object({ id: z.uuid() }), query: z.object({}) });

  readonly activeSchema = z.object({ body: z.unknown(), params: z.object({}), query: z.object({ pieceId: recordId }) });

  readonly contextSchema = z.object({
    body: z.unknown(), params: z.object({}),
    query: z.object({ pieceId: recordId, sheetMusicId: recordId, assignmentId: recordId.optional() })
  });

  readonly callbackSchema = z.object({
    body: z.object({
      evaluationId: z.string().min(1).max(128),
      attempt: z.number().int().min(1),
      job: z.enum(['quality_check', 'audio_analysis', 'comparison', 'feedback']),
      status: z.enum(['started', 'done', 'failed', 'rejected']),
      code: z.string().max(64).nullable().optional(),
      reason: z.string().max(1000).nullable().optional(),
      result: z.looseObject({
        overallScore: z.number().min(0).max(100), pitchAccuracyPercent: z.number().min(0).max(100),
        rhythmAccuracyPercent: z.number().min(0).max(100), aiFeedback: z.string()
      }).nullable().optional()
    }).refine((callback) => callback.status !== 'done' || callback.job !== 'feedback' || Boolean(callback.result), {
      message: 'Thiếu kết quả phân tích.'
    }),
    params: z.object({}), query: z.object({})
  });
}
