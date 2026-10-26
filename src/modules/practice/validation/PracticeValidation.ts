import { z } from 'zod';
import PracticeConstant from '../constant/PracticeConstant.ts';

const { historyPageSize, accuracyBounds, messages } = PracticeConstant;

// Seeded pieces and assignments use readable ids, so these are not restricted to UUIDs
const recordId = z.string().trim().min(1).max(64);

// Multi-value filters arrive as "a,b,c" (or repeated keys); an empty value means no filter
const csvList = <TItem extends z.ZodType>(itemSchema: TItem) => z.preprocess(
  (raw) => (typeof raw === 'string' ? raw.split(',').map((part) => part.trim()).filter(Boolean) : raw ?? []),
  z.array(itemSchema).max(50)
);
const accuracy = z.coerce.number().min(accuracyBounds.MIN).max(accuracyBounds.MAX).optional();

export default class PracticeValidation {
  readonly createSchema = z.object({
    body: z.object({
      sheetMusicId: recordId,
      assignmentId: recordId.optional(),
      studentUploadId: z.uuid(),
      practiceMode: z.enum(['SOLO', 'ENSEMBLE']).optional()
    }).strict(),
    params: z.object({}), query: z.object({})
  });

  readonly idSchema = z.object({ body: z.unknown(), params: z.object({ id: z.uuid() }), query: z.object({}) });

  readonly activeSchema = z.object({ body: z.unknown(), params: z.object({}), query: z.object({ sheetMusicId: recordId }) });

  readonly historySchema = z.object({
    body: z.unknown(), params: z.object({}),
    query: z.object({
      pieceIds: csvList(recordId),
      fromDate: z.iso.date().optional(),
      toDate: z.iso.date().optional(),
      accuracyRanges: csvList(z.enum(['ABOVE_90', '70_90', '50_70', 'BELOW_50'])),
      minAccuracy: accuracy,
      maxAccuracy: accuracy,
      title: z.string().trim().max(PracticeConstant.historyTitleMax).optional().transform((title) => title || undefined),
      kinds: csvList(z.enum(['PRACTICE', 'BONUS', 'SOLO', 'ENSEMBLE'])),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(historyPageSize.MAX).default(historyPageSize.DEFAULT)
    }).superRefine((query, context) => {
      if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
        context.addIssue({ code: 'custom', path: ['toDate'], message: messages.DATE_RANGE_INVALID });
      }
      if (query.minAccuracy !== undefined && query.maxAccuracy !== undefined && query.minAccuracy > query.maxAccuracy) {
        context.addIssue({ code: 'custom', path: ['maxAccuracy'], message: messages.ACCURACY_RANGE_INVALID });
      }
    })
  });

  readonly emptySchema = z.object({ body: z.unknown(), params: z.object({}), query: z.object({}) });

  readonly sheetParamsSchema = z.object({ body: z.unknown(), params: z.object({ sheetMusicId: recordId }), query: z.object({}) });

  readonly contextSchema = z.object({
    body: z.unknown(), params: z.object({}),
    query: z.object({ sheetMusicId: recordId, assignmentId: recordId.optional() })
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
