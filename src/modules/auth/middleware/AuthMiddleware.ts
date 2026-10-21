import AppError from '../../../utils/AppError.ts';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import AuthConstant from '../constant/AuthConstant.ts';
import AuthService from '../service/AuthService.ts';

function readBearerToken(request: Request): string | null {
  const authorizationHeader = request.headers.authorization || '';
  const [scheme, accessToken] = authorizationHeader.split(' ');
  return scheme === 'Bearer' && accessToken ? accessToken : null;
}

export async function requireAuthenticatedUser(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const accessToken = readBearerToken(request);
  if (!accessToken) return next(AppError.unauthorized(AuthConstant.messages.JWT_INVALID));
  const tokenPayload = AuthService.verifyAccessToken(accessToken) as { userId: string };
  request.auth = { user: await AuthService.getAuthenticatedUser(tokenPayload.userId) };
  return next();
}

// Public endpoints: attaches the user when a token is sent, otherwise continues as guest.
// An invalid/expired token still returns 401 so the client can refresh it.
export async function attachOptionalUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  if (!readBearerToken(request)) return next();
  return requireAuthenticatedUser(request, response, next);
}

export function requireRoles(...allowedRoles: Backend.UserRole[]): RequestHandler {
  return function requireRolesMiddleware(request: Request, _response: Response, next: NextFunction) {
    const user = request.auth?.user;
    if (!user) return next(AppError.unauthorized(AuthConstant.messages.JWT_INVALID));
    if (!allowedRoles.includes(user.role)) return next(AppError.forbidden());
    return next();
  };
}
