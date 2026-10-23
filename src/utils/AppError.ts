import MessageConstant from '../constants/MessageConstant.ts';

interface AppErrorOptions {
  code?: Backend.MessageCode;
  field?: string;
  details?: Record<string, string>;
  fieldErrors?: Backend.FieldError[];
}

export default class AppError extends Error {
  readonly statusCode: number;
  readonly code?: Backend.MessageCode;
  readonly field?: string;
  readonly details?: Record<string, string>;
  readonly fieldErrors?: Backend.FieldError[];

  constructor(message: string, statusCode: number = 500, { code, field, details, fieldErrors }: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
    this.details = details;
    this.fieldErrors = fieldErrors;
  }

  static unauthorized(message: string = 'Thông tin xác thực không hợp lệ.'): AppError {
    return new AppError(message, 401);
  }

  static badRequest(message: string = 'Dữ liệu yêu cầu không hợp lệ.', options: AppErrorOptions = {}): AppError {
    return new AppError(message, 400, options);
  }

  static forbidden(message: string = 'Bạn không có quyền thực hiện thao tác này.'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message: string = 'Không tìm thấy dữ liệu yêu cầu.'): AppError {
    return new AppError(message, 404);
  }

  static conflict(message: string = 'Dữ liệu đã tồn tại.', options: AppErrorOptions = {}): AppError {
    return new AppError(message, 409, options);
  }

  // Error that points at one request field (response carries it in `errors` and `field`)
  static fieldError(statusCode: number, fieldError: Backend.FieldError): AppError {
    return new AppError(fieldError.message, statusCode, { code: fieldError.code, field: fieldError.field, fieldErrors: [fieldError] });
  }

  // Error that carries a system message code (MSG-xx) with its Vietnamese text already filled in
  static withMessage(
    statusCode: number,
    code: Backend.MessageCode,
    params: Record<string, string | number> = {},
    field?: string
  ): AppError {
    return new AppError(MessageConstant.format(code, params), statusCode, { code, field });
  }
}
