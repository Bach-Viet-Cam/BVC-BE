import type { Application, ErrorRequestHandler } from 'express';

export function registerErrorHandlers(app: Application): void {
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const isValidationError = error.name === 'ZodError';
    const statusCode = isValidationError ? 400 : error.statusCode || error.status || 500;
    const message = statusCode >= 500
      ? 'Vui lòng thử lại sau'
      : isValidationError
        ? 'Kiểm tra lại dữ liệu gửi đi'
        : error.message;

    if (statusCode >= 500) console.error(error);

    return response.status(statusCode).json({ success: false, message });
  };
  app.use(errorHandler);
}
