import { z } from 'zod';
import AuthConstant from '../constant/AuthConstant.ts';

const requestShape = { params: z.object({}), query: z.object({}) };

export default class AuthValidation {
  static readonly loginSchema = z.object({
    body: z.object({ email: z.string().trim().email(), password: z.string().optional() }),
    ...requestShape
  });
  static readonly googleAuthSchema = z.object({
    body: z.object({ credential: z.string().trim().min(1), role: z.number().int().optional() }),
    ...requestShape
  });
  static readonly refreshSchema = z.object({ body: z.object({}), ...requestShape });
  static readonly logoutSchema = AuthValidation.refreshSchema;
  static readonly allowedRegistrationRoles = new Set([
    AuthConstant.roles.STUDENT,
    AuthConstant.roles.TEACHER
  ]);
}
