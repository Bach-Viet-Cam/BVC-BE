import { z } from 'zod';
import MessageConstant from '../../../constants/MessageConstant.ts';
import ClassConstant from '../constant/ClassConstant.ts';

const format = MessageConstant.format;
const label = ClassConstant.fieldLabels.evaluation;
const maxLength = ClassConstant.limits.EVALUATION_MAX;
const classId = z.string().trim().min(1).max(64);

export default class StudentStatsValidation {
  static readonly lecturerStatsSchema = z.object({
    body: z.unknown(),
    params: z.object({ id: classId, studentId: z.uuid() }),
    query: z.object({})
  });

  static readonly myStatsSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({ classId: classId.optional() })
  });

  static readonly evaluationSchema = z.object({
    body: z.object({
      content: z
        .string({ error: format('MSG-35', { field: label }) })
        .trim()
        .min(1, format('MSG-35', { field: label }))
        .max(maxLength, format('MSG-37', { field: label, max: maxLength }))
    }),
    params: z.object({ id: classId, studentId: z.uuid() }),
    query: z.object({})
  });
}
