import type { NextFunction, Request, RequestHandler, Response } from 'express';
import AppError from '../utils/AppError.ts';
import AuthConstant from '../modules/auth/constant/AuthConstant.ts';

export function requireRoles(...allowedRoles: number[]): RequestHandler {
  return function requireRolesMiddleware(request: Request, _response: Response, next: NextFunction): void {
    const currentRole = request.auth?.user.role;
    if (currentRole === undefined || !allowedRoles.includes(currentRole)) {
      return next(AppError.forbidden(AuthConstant.messages.FORBIDDEN_ROLE));
    }
    return next();
  };
}

// Lets a route be shared by several roles: users with another role fall through to the next matching route
// instead of being rejected, so two modules can serve the same path to different audiences.
export function skipUnlessRoles(...allowedRoles: number[]): RequestHandler {
  return function skipUnlessRolesMiddleware(request: Request, _response: Response, next: NextFunction): void {
    const currentRole = request.auth?.user.role;
    if (currentRole === undefined || !allowedRoles.includes(currentRole)) return next('route');
    return next();
  };
}
