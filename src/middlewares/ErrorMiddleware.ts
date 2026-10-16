import type { Application, ErrorRequestHandler } from 'express';
import type { ZodError } from 'zod';

interface ErrorBody { success: false; message: string; code?: string; field?: string; }

const REQUEST_SECTIONS = new Set(['body', 'query', 'params']);

function buildValidationErrorBody(error: ZodError): ErrorBody {
  const [firstIssue] = error.issues;
  const issueParams = (firstIssue as { params?: { code?: string } } | undefined)?.params;
  const fieldPath = (firstIssue?.path ?? []).filter((segment) => !REQUEST_SECTIONS.has(String(segment)));
  const field = fieldPath.length > 0 ? fieldPath.join('.') : undefined;
  if (issueParams?.code) return { success: false, code: issueParams.code, field, message: firstIssue.message };
  return { success: false, field, message: 'Kiểm tra lại dữ liệu gửi đi' };
}

export function registerErrorHandlers(app: Application): void {
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error.name === 'ZodError') return response.status(400).json(buildValidationErrorBody(error as ZodError));

    // body-parser errors expose `type`, e.g. entity.too.large / entity.parse.failed
    const statusCode = error.statusCode || error.status || 500;
    if (statusCode >= 500) console.error(error);

    const errorBody: ErrorBody = {
      success: false,
      message: statusCode >= 500 ? 'Vui lòng thử lại sau' : error.message
    };
    if (statusCode < 500 && error.code && /^MSG-\d+$/.test(error.code)) errorBody.code = error.code;
    if (statusCode < 500 && error.field) errorBody.field = error.field;
    return response.status(statusCode).json(errorBody);
  };
  app.use(errorHandler);
}
