import AppError from '../../../utils/AppError.ts';
import type { NextFunction, Request, Response } from 'express';
import AuthConstant from '../constant/AuthConstant.ts';
import AuthService from '../service/AuthService.ts';

export async function requireAuthenticatedUser(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const authorizationHeader = request.headers.authorization || '';
  const [scheme, accessToken] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !accessToken) return next(AppError.unauthorized(AuthConstant.messages.JWT_INVALID));
  const tokenPayload = AuthService.verifyAccessToken(accessToken) as { userId: string };
  request.auth = { user: await AuthService.getAuthenticatedUser(tokenPayload.userId) };
  return next();
}
