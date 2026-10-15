import { z } from 'zod';

export default class PlatformValidation {
  static readonly listInstrumentsSchema = z.object({
    body: z.unknown(),
    params: z.object({}),
    query: z.object({ active: z.enum(['true', 'false']).default('true') })
  });
}
