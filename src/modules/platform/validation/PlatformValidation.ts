import { z } from 'zod';
import PlatformConstant from '../constant/PlatformConstant.ts';

const limits = PlatformConstant.gradingLimits;
const messages = PlatformConstant.messages;

function percent(message: string) {
  return z.number({ error: message }).int(message).min(limits.MIN, message).max(limits.MAX, message);
}

export default class PlatformValidation {
  static readonly listInstrumentsSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({ active: z.enum(['true', 'false']).default('true') })
  });

  static readonly getGradingSchema = z.object({ body: z.unknown(), params: z.object({}), query: z.object({}) });

  static readonly updateGradingSchema = z.object({
    body: z.object({ minAccuracy: percent(messages.minAccuracyRange), atRiskMargin: percent(messages.atRiskMarginRange) }),
    params: z.object({}),
    query: z.object({})
  });
}
