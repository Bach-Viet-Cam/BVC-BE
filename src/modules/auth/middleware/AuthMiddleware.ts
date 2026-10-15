import AppError from '../../../utils/AppError.ts';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
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

export function requireRoles(...allowedRoles: Backend.UserRole[]): RequestHandler {
  return function requireRolesMiddleware(request: Request, _response: Response, next: NextFunction): void {
    const user = request.auth?.user as Backend.UserDTO | undefined;
    if (!user) return next(AppError.unauthorized(AuthConstant.messages.JWT_INVALID));
    if (!allowedRoles.includes(user.role)) return next(AppError.forbidden(AuthConstant.messages.ROLE_FORBIDDEN));
    return next();
  };
}
