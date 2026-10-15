import type { Application, ErrorRequestHandler } from 'express';
import type { ZodError } from 'zod';

const requestSections = new Set(['body', 'params', 'query']);

function inferIssueCode(issue: ZodError['issues'][number]): Backend.MessageCode | undefined {
  if (issue.code === 'too_big') return issue.origin === 'string' ? 'MSG-37' : 'MSG-03';
  if (issue.code === 'too_small') return issue.origin === 'string' ? 'MSG-35' : 'MSG-03';
  if (issue.code === 'invalid_type' && issue.input === undefined) return 'MSG-35';
  return undefined;
}

function toFieldErrors(error: ZodError): Backend.FieldError[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String);
    const field = requestSections.has(path[0]) ? path.slice(1).join('.') : path.join('.');
    return { field, code: inferIssueCode(issue), message: issue.message };
  });
}

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

    const fieldErrors: Backend.FieldError[] | undefined = isValidationError ? toFieldErrors(error) : error.fieldErrors;
    return response.status(statusCode).json({
      success: false,
      message,
      ...(statusCode < 500 && error.code ? { code: error.code } : {}),
      ...(fieldErrors?.length ? { errors: fieldErrors } : {})
    });
  };
  app.use(errorHandler);
}
