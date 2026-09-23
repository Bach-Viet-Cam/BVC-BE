import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

export function validateRequest(schema: ZodType): RequestHandler {
  return function validateRequestMiddleware(request: Request, _response: Response, next: NextFunction) {
    const parsedRequest = schema.safeParse({ body: request.body, params: request.params, query: request.query });
    if (!parsedRequest.success) return next(parsedRequest.error);
    request.validated = parsedRequest.data as NonNullable<Request['validated']>;
    return next();
  };
}
