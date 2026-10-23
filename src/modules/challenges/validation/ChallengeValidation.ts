import { z } from 'zod';
import MessageConstant from '../../../constants/MessageConstant.ts';
import ChallengeConstant from '../constant/ChallengeConstant.ts';

const limits = ChallengeConstant.limits;
const labels = ChallengeConstant.fieldLabels;
const format = MessageConstant.format;

const title = z
  .string({ error: format('MSG-35', { field: labels.title }) })
  .trim()
  .min(1, format('MSG-35', { field: labels.title }))
  .max(limits.TITLE_MAX, format('MSG-37', { field: labels.title, max: limits.TITLE_MAX }));

const descriptionText = z.string().trim().max(limits.DESCRIPTION_MAX, format('MSG-37', { field: labels.description, max: limits.DESCRIPTION_MAX }));
const description = descriptionText.nullable().optional().transform((value) => value || null);

const optionalId = z.uuid().nullable().optional();
const classIds = z.array(z.uuid()).max(50).transform((value) => [...new Set(value)]);
const weekStart = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, ChallengeConstant.messages.WEEK_NOT_MONDAY).nullable().optional();

const rangeMessage = (field: string, min: number, max: number): string => format('MSG-03', { field, min, max });
const boundedInt = (field: string, min: number, max: number) =>
  z.number({ error: rangeMessage(field, min, max) }).int(rangeMessage(field, min, max)).min(min, rangeMessage(field, min, max)).max(max, rangeMessage(field, min, max));

const minAccuracy = boundedInt(labels.minAccuracy, limits.ACCURACY_MIN, limits.ACCURACY_MAX).nullable().optional();
const requiredBpm = boundedInt(labels.requiredBpm, limits.BPM_MIN, limits.BPM_MAX).nullable().optional();
const maxSubmissions = boundedInt(labels.maxSubmissions, 1, ChallengeConstant.maxSubmissionsCap).optional();

const idParams = z.object({ id: z.uuid() });
const emptyQuery = z.object({});

export default class ChallengeValidation {
  static readonly createSchema = z.object({
    body: z.object({
      title,
      description,
      instrumentId: optionalId,
      pieceId: optionalId,
      classIds: classIds.optional(),
      weekStart,
      minAccuracy,
      requiredBpm,
      maxSubmissions,
      publish: z.boolean().default(false)
    }),
    params: z.object({}),
    query: emptyQuery
  });

  static readonly updateSchema = z.object({
    body: z.object({
      title: title.optional(),
      description: descriptionText.nullable().optional(),
      instrumentId: optionalId,
      pieceId: optionalId,
      classIds: classIds.optional(),
      weekStart,
      minAccuracy,
      requiredBpm,
      maxSubmissions
    }),
    params: idParams,
    query: emptyQuery
  });

  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: emptyQuery });

  static readonly listSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) })
  });

  static readonly emptySchema = z.object({ body: z.unknown(), params: z.object({}), query: emptyQuery });

  static readonly piecesSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({
      instrumentId: z.uuid().optional(),
      q: z.string().trim().max(100).optional().transform((value) => value || undefined)
    })
  });
}
