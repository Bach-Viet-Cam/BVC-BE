import AppError from '../../../utils/AppError.ts';
import type { NextFunction, Request, Response } from 'express';
import AuthConstant from '../constant/AuthConstant.ts';
import AuthService from '../service/AuthService.ts';

export async function attachOptionalUser(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const [scheme, accessToken] = (request.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !accessToken) return next();
  try {
    const tokenPayload = AuthService.verifyAccessToken(accessToken) as { userId: string };
    request.auth = { user: await AuthService.getAuthenticatedUser(tokenPayload.userId) };
  } catch {
    // Token không hợp lệ: coi như khách, route công khai vẫn phục vụ dữ liệu công khai.
  }
  return next();
}

export async function requireAuthenticatedUser(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const authorizationHeader = request.headers.authorization || '';
  const [scheme, accessToken] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !accessToken) return next(AppError.unauthorized(AuthConstant.messages.JWT_INVALID));
  const tokenPayload = AuthService.verifyAccessToken(accessToken) as { userId: string };
  request.auth = { user: await AuthService.getAuthenticatedUser(tokenPayload.userId) };
  return next();
}
