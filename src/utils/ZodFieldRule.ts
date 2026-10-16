import { z } from 'zod';
import MessageConstant from '../constants/MessageConstant.ts';

// Builds Zod schemas whose issues carry a system message code (read by ErrorMiddleware)
export default class ZodFieldRule {
  static addMessageIssue(
    context: z.RefinementCtx,
    code: Backend.MessageCode,
    params: Record<string, string | number>
  ): void {
    context.addIssue({ code: 'custom', message: MessageConstant.format(code, params), params: { code } });
  }

  static requiredText(label: string, maxLength: number) {
    return z.unknown()
      .superRefine((rawValue, context) => {
        const text = typeof rawValue === 'string' ? rawValue.trim() : '';
        if (!text) return ZodFieldRule.addMessageIssue(context, 'MSG-35', { field: label });
        if (text.length > maxLength) ZodFieldRule.addMessageIssue(context, 'MSG-37', { field: label, max: maxLength });
      })
      .transform((rawValue) => String(rawValue).trim());
  }

  // Empty string / null → null
  static optionalText(label: string, maxLength: number) {
    return z.unknown()
      .superRefine((rawValue, context) => {
        if (rawValue === undefined || rawValue === null) return;
        if (typeof rawValue !== 'string') return ZodFieldRule.addMessageIssue(context, 'MSG-35', { field: label });
        if (rawValue.trim().length > maxLength) ZodFieldRule.addMessageIssue(context, 'MSG-37', { field: label, max: maxLength });
      })
      .transform((rawValue) => (typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null))
      .optional();
  }

  static requiredId(label: string) {
    return z.unknown()
      .superRefine((rawValue, context) => {
        if (typeof rawValue !== 'string' || !rawValue.trim()) ZodFieldRule.addMessageIssue(context, 'MSG-35', { field: label });
      })
      .transform((rawValue) => String(rawValue).trim());
  }

  static requiredIdList(label: string) {
    return z.unknown()
      .superRefine((rawValue, context) => {
        const isValidList = Array.isArray(rawValue) && rawValue.length > 0
          && rawValue.every((entry) => typeof entry === 'string' && entry.trim());
        if (!isValidList) ZodFieldRule.addMessageIssue(context, 'MSG-35', { field: label });
      })
      .transform((rawValue) => [...new Set((rawValue as string[]).map((entry) => entry.trim()))]);
  }

  // Accepts ?ids=a&ids=b, ?ids[]=a, ?ids=a,b
  static queryIdList() {
    return z.preprocess((rawValue) => {
      if (rawValue === undefined || rawValue === '') return [];
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      return values.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean);
    }, z.array(z.string()));
  }

  static page() {
    return z.coerce.number().int().min(1).default(1);
  }

  static pageSize(defaultSize: number, maxSize: number) {
    return z.coerce.number().int().min(1).max(maxSize).default(defaultSize);
  }
}
