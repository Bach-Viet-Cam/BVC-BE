import { z } from 'zod';

export default class AudioValidation {
  readonly createSchema = z.object({
    body: z.object({ templateUrl: z.url().max(4096), studentUrl: z.url().max(4096) }).strict(),
    params: z.object({}), query: z.object({})
  });
  readonly statusSchema = z.object({
    body: z.unknown(), params: z.object({ evaluationId: z.uuid() }), query: z.object({})
  });
  readonly resultSchema = z.object({
    evaluationId: z.string(), status: z.enum(['queued', 'processing', 'waiting', 'completed', 'failed', 'rejected']),
    stage: z.enum(['quality_check', 'audio_analysis', 'comparison', 'feedback']).nullable().optional(),
    attempt: z.number().int().min(1).optional(),
    // Extra analysis fields (segments, tempos, ...) are kept for the result screen
    result: z.looseObject({
      overallScore: z.number().min(0).max(100), pitchAccuracyPercent: z.number().min(0).max(100),
      rhythmAccuracyPercent: z.number().min(0).max(100), aiFeedback: z.string()
    }).nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable()
  }).superRefine((record, context) => {
    if (record.status === 'completed' && !record.result) context.addIssue({ code: 'custom', message: 'Thiếu kết quả phân tích.' });
    if ((record.status === 'failed' || record.status === 'rejected') && !record.error) context.addIssue({ code: 'custom', message: 'Thiếu thông tin lỗi phân tích.' });
  });
}
