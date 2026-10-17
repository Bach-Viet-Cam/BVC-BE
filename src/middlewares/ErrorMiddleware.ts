import AppError from '../utils/AppError.ts';
import type { Application, ErrorRequestHandler } from 'express';

export function registerErrorHandlers(app: Application): void {
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    console.log(error.message)
    const isValidationError = error.name === 'ZodError';
    const statusCode = isValidationError ? 400 : error.statusCode || error.status || 500;
    const message = statusCode >= 500 && !(error instanceof AppError && statusCode === 503)
      ? 'Vui lòng thử lại sau'
      : isValidationError
        ? 'Kiểm tra lại dữ liệu gửi đi'
        : error.message;

    if (statusCode >= 500) console.error(error instanceof AppError ? error.message : error);

    return response.status(statusCode).json({ success: false, message, ...(error instanceof AppError && error.details ? { data: error.details } : {}) });
  };
  app.use(errorHandler);
}
