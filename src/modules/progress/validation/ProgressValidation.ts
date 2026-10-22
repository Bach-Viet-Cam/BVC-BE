import { z } from 'zod';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import ProgressConstant from '../constant/ProgressConstant.ts';

const isoDate = z.string().refine(DateTimeUtil.isValidIsoDate, ProgressConstant.messages.INVALID_DATE).optional();
const studentParams = z.object({ id: z.uuid(), studentId: z.uuid() });

export default class ProgressValidation {
  static readonly classSchema = z.object({ body: z.unknown(), params: z.object({ id: z.uuid() }), query: z.object({}) });

  static readonly summarySchema = z.object({ body: z.unknown(), params: studentParams, query: z.object({}) });

  static readonly historySchema = z.object({
    body: z.unknown(),
    params: studentParams,
    query: z.object({
      from: isoDate,
      to: isoDate,
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(ProgressConstant.limits.PAGE_SIZE_MAX).default(ProgressConstant.limits.PAGE_SIZE_DEFAULT)
    })
  });
}
