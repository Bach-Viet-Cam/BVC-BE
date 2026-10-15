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
