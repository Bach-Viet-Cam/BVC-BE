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

const recordId = z.string().trim().min(1).max(64);
const sheetMusicId = recordId.nullable().optional().transform((value) => value || null);

const content = { title, description, kind, sheetMusicId, requiredBpm, maxSubmissions: z.number().int().min(1).max(2147483647).nullable().optional() };
const idParams = z.object({ id: recordId });
const emptyQuery = z.object({});

const idList = z
  .array(recordId)
  .min(1)
  .max(50)
  .transform((ids) => [...new Set(ids)]);

export default class AssignmentValidation {
  static readonly contentShape = content;

  static readonly createSchema = z.object({
    body: z.object({ classId: recordId, ...content, publish: z.boolean().default(false) }),
    params: z.object({}),
    query: emptyQuery
  });

  static readonly updateSchema = z.object({ body: z.object(content), params: idParams, query: emptyQuery });

  static readonly idSchema = z.object({ body: z.unknown(), params: idParams, query: emptyQuery });

  static readonly listSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({
      classId: recordId.optional(),
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

  static readonly assignSchema = z.object({ body: z.object({ assignmentIds: idList, classIds: idList }), params: z.object({}), query: emptyQuery });

  static readonly overviewSchema = z.object({ body: z.unknown(), params: z.object({}), query: emptyQuery });

  static readonly sheetGroupSchema = z.object({ body: z.unknown(), params: z.object({ sheetMusicId: z.uuid() }), query: emptyQuery });

  static readonly sheetMusicSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z
      .object({ classId: recordId.optional(), instrumentId: z.uuid().optional() })
      .refine((query) => (query.classId === undefined) !== (query.instrumentId === undefined), { message: 'Cần chọn đúng một trong lớp hoặc nhạc cụ.' })
  });

  static readonly studentSubmissionsSchema = z.object({
    body: z.unknown(),
    params: z.object({ id: recordId, studentId: z.uuid() }),
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
