import { z } from 'zod';
import MessageConstant from '../../../constants/MessageConstant.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';

const limits = AssignmentConstant.limits;
const labels = AssignmentConstant.fieldLabels;
const messages = AssignmentConstant.messages;
const format = MessageConstant.format;

const title = z
  .string({ error: format('MSG-35', { field: labels.title }) })
  .trim()
  .min(1, format('MSG-35', { field: labels.title }))
  .max(limits.TITLE_MAX, format('MSG-37', { field: labels.title, max: limits.TITLE_MAX }));

const description = z
  .string()
  .trim()
  .max(limits.DESCRIPTION_MAX, format('MSG-37', { field: labels.description, max: limits.DESCRIPTION_MAX }))
  .nullable()
  .optional()
  .transform((value) => value || null);

const kind = z.enum(AssignmentConstant.kinds, { error: messages.KIND_REQUIRED });

const requiredBpm = z
  .number({ error: messages.BPM_RANGE })
  .int(messages.BPM_RANGE)
  .min(limits.BPM_MIN, messages.BPM_RANGE)
  .max(limits.BPM_MAX, messages.BPM_RANGE)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const pieceId = z.uuid().nullable().optional().transform((value) => value || null);

const content = { title, description, kind, pieceId, requiredBpm };
const idParams = z.object({ id: z.uuid() });
const emptyQuery = z.object({});

export default class AssignmentValidation {
  static readonly createSchema = z.object({
    body: z.object({ classId: z.uuid({ error: format('MSG-35', { field: labels.classId }) }), ...content, publish: z.boolean().default(false) }),
    params: z.object({}),
    query: emptyQuery
  });

  static readonly updateSchema = z.object({ body: z.object(content), params: idParams, query: emptyQuery });

  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: emptyQuery });

  static readonly listSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({
      classId: z.uuid().optional(),
      kind: z.enum(AssignmentConstant.kinds).optional(),
      status: z.enum(AssignmentConstant.statuses).optional(),
      q: z
        .string()
        .trim()
        .max(limits.SEARCH_MAX, format('MSG-37', { field: labels.q, max: limits.SEARCH_MAX }))
        .optional()
        .transform((value) => value || undefined),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
  });

  static readonly piecesSchema = z.object({ body: z.unknown(), params: z.object({}), query: z.object({ classId: z.uuid() }) });

  static readonly studentSubmissionsSchema = z.object({
    body: z.unknown(),
    params: z.object({ id: z.uuid(), studentId: z.uuid() }),
    query: emptyQuery
  });

  static readonly commentSchema = z.object({
    body: z.object({
      content: z
        .string({ error: format('MSG-35', { field: labels.content }) })
        .trim()
        .min(1, format('MSG-35', { field: labels.content }))
        .max(limits.COMMENT_MAX, format('MSG-37', { field: labels.content, max: limits.COMMENT_MAX }))
    }),
    params: idParams,
    query: emptyQuery
  });
}
