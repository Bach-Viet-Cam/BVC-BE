import { z } from 'zod';
import MessageConstant from '../../../constants/MessageConstant.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import ClassConstant from '../constant/ClassConstant.ts';

const limits = ClassConstant.limits;
const labels = ClassConstant.fieldLabels;
const format = MessageConstant.format;

function requiredText(field: string, maxLength: number) {
  const label = labels[field];
  return z
    .string({ error: format('MSG-35', { field: label }) })
    .trim()
    .min(1, format('MSG-35', { field: label }))
    .max(maxLength, format('MSG-37', { field: label, max: maxLength }));
}

function optionalSearch() {
  return z.string().trim().max(limits.SEARCH_MAX, format('MSG-37', { field: labels.q, max: limits.SEARCH_MAX })).optional()
    .transform((value) => value || undefined);
}

const isoDate = z
  .string({ error: format('MSG-35', { field: labels.startDate }) })
  .trim()
  .min(1, format('MSG-35', { field: labels.startDate }))
  .refine(DateTimeUtil.isValidIsoDate, ClassConstant.messages.INVALID_DATE);

const instrumentId = z.uuid({ error: format('MSG-35', { field: labels.instrumentId }) });
const description = z
  .string()
  .trim()
  .max(limits.DESCRIPTION_MAX, format('MSG-37', { field: labels.description, max: limits.DESCRIPTION_MAX }))
  .nullable()
  .optional();

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(limits.PAGE_SIZE_MAX).default(limits.PAGE_SIZE_DEFAULT)
};

const classParams = z.object({ id: z.uuid() });
const emptyQuery = z.object({});

export default class ClassValidation {
  static readonly listClassesSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({
      q: optionalSearch(),
      cohort: z.string().trim().max(limits.COHORT_MAX).optional().transform((value) => value || undefined),
      instrumentId: z.uuid().optional(),
      status: z.enum(['ACTIVE', 'ENDED', 'ALL']).default('ACTIVE'),
      ...pagination
    })
  });

  static readonly createClassSchema = z.object({
    body: z.object({
      name: requiredText('name', limits.NAME_MAX),
      cohort: requiredText('cohort', limits.COHORT_MAX),
      instrumentId,
      description,
      startDate: isoDate
    }),
    params: z.object({}),
    query: emptyQuery
  });

  static readonly updateClassSchema = z.object({
    body: z.object({
      name: requiredText('name', limits.NAME_MAX).optional(),
      cohort: requiredText('cohort', limits.COHORT_MAX).optional(),
      instrumentId: instrumentId.optional(),
      description,
      startDate: isoDate.optional()
    }),
    params: classParams,
    query: emptyQuery
  });

  static readonly classIdSchema = z.object({ body: z.unknown(), params: classParams, query: emptyQuery });

  static readonly templateSchema = z.object({ body: z.unknown(), params: z.object({}), query: emptyQuery });

  static readonly listMembersSchema = z.object({
    body: z.unknown(),
    params: classParams,
    query: z.object({
      q: optionalSearch(),
      accountStatus: z.enum(['ALL', 'ACTIVE', 'PENDING']).default('ALL'),
      ...pagination
    })
  });

  static readonly addMemberSchema = z.object({
    body: z.object({
      studentCode: requiredText('studentCode', limits.STUDENT_CODE_MAX),
      fullName: requiredText('fullName', limits.FULL_NAME_MAX),
      email: requiredText('email', limits.EMAIL_MAX).pipe(z.email(ClassConstant.rowReasons.INVALID_EMAIL + '.'))
    }),
    params: classParams,
    query: emptyQuery
  });

  static readonly memberParamsSchema = z.object({
    body: z.unknown(),
    params: z.object({ id: z.uuid(), studentId: z.uuid() }),
    query: emptyQuery
  });

  static readonly importLogParamsSchema = z.object({
    body: z.unknown(),
    params: z.object({ id: z.uuid(), logId: z.uuid() }),
    query: emptyQuery
  });
}
