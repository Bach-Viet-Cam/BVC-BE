import AppError from '../utils/AppError.ts';
import type { Application, ErrorRequestHandler } from 'express';
import type { ZodError } from 'zod';

interface ErrorBody { success: false; message: string; code?: string; field?: string; data?: AppError['details']; errors?: Backend.FieldError[]; }

const REQUEST_SECTIONS = new Set(['body', 'query', 'params']);

function inferIssueCode(issue: ZodError['issues'][number]): Backend.MessageCode | undefined {
  if (issue.code === 'too_big') return issue.origin === 'string' ? 'MSG-37' : 'MSG-03';
  if (issue.code === 'too_small') return issue.origin === 'string' ? 'MSG-35' : 'MSG-03';
  if (issue.code === 'invalid_type' && issue.input === undefined) return 'MSG-35';
  return undefined;
}

function toFieldErrors(error: ZodError): Backend.FieldError[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String);
    const field = (REQUEST_SECTIONS.has(path[0]) ? path.slice(1) : path).join('.');
    const issueParams = (issue as { params?: { code?: Backend.MessageCode } }).params;
    return { field, code: issueParams?.code ?? inferIssueCode(issue), message: issue.message };
  });
}

function buildValidationErrorBody(error: ZodError): ErrorBody {
  const [firstIssue] = error.issues;
  const issueParams = (firstIssue as { params?: { code?: string } } | undefined)?.params;
  const fieldPath = (firstIssue?.path ?? []).filter((segment) => !REQUEST_SECTIONS.has(String(segment)));
  const field = fieldPath.length > 0 ? fieldPath.join('.') : undefined;
  const errors = toFieldErrors(error);
  if (issueParams?.code) return { success: false, code: issueParams.code, field, message: firstIssue.message, errors };
  return { success: false, field, message: 'Kiểm tra lại dữ liệu gửi đi', errors };
}

export function registerErrorHandlers(app: Application): void {
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error.name === 'ZodError') return response.status(400).json(buildValidationErrorBody(error as ZodError));

    // body-parser errors expose `type`, e.g. entity.too.large / entity.parse.failed
    const statusCode = error.statusCode || error.status || 500;
    if (statusCode >= 500) console.error(error instanceof AppError ? error.message : error);

    // An AppError 503 carries a message the user can act on (e.g. audio queue state), so it is shown as-is
    const isMessageExposed = statusCode < 500 || (error instanceof AppError && statusCode === 503);
    const errorBody: ErrorBody = {
      success: false,
      message: isMessageExposed ? error.message : 'Vui lòng thử lại sau'
    };
    if (statusCode < 500 && error.code && /^MSG-\d+$/.test(error.code)) errorBody.code = error.code;
    if (statusCode < 500 && error.field) errorBody.field = error.field;
    if (error instanceof AppError && error.details) errorBody.data = error.details;
    if (statusCode < 500 && error.fieldErrors?.length) errorBody.errors = error.fieldErrors;
    return response.status(statusCode).json(errorBody);
  };
  app.use(errorHandler);
}
