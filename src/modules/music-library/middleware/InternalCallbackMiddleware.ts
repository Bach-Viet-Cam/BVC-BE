import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import EnvConfig from '../../../config/EnvConfig.ts';
import AppError from '../../../utils/AppError.ts';

// Service-to-service calls from the AI service authenticate with a shared secret header
export function requireCallbackSecret(request: Request, _response: Response, next: NextFunction): void {
  const givenSecret = Buffer.from(String(request.headers['x-callback-secret'] || ''));
  const expectedSecret = Buffer.from(EnvConfig.aiCallbackSecret);
  const isValid = expectedSecret.length > 0
    && givenSecret.length === expectedSecret.length
    && crypto.timingSafeEqual(givenSecret, expectedSecret);
  if (!isValid) return next(AppError.unauthorized('Callback secret không hợp lệ.'));
  return next();
}
