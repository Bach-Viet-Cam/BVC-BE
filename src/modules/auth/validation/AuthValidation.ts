import { z } from 'zod';

const requestShape = { params: z.object({}), query: z.object({}) };

export default class AuthValidation {
  static readonly googleAuthSchema = z.object({
    body: z.object({ credential: z.string().trim().min(1) }).strict(),
    ...requestShape
  });
  static readonly refreshSchema = z.object({ body: z.object({}), ...requestShape });
  static readonly logoutSchema = AuthValidation.refreshSchema;
}
