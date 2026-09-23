import type { NextFunction, Request, RequestHandler, Response } from 'express';

export default class AsyncHandler {
  static wrap(handler: RequestHandler): RequestHandler {
    return function wrappedAsyncHandler(request: Request, response: Response, next: NextFunction) {
      return Promise.resolve(handler(request, response, next)).catch(next);
    };
  }
}
