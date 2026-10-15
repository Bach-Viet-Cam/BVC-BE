export default class AppError extends Error {
  readonly statusCode: number;
  readonly code?: Backend.MessageCode;
  readonly fieldErrors?: Backend.FieldError[];

  constructor(message: string, statusCode: number = 500, options: { code?: Backend.MessageCode; fieldErrors?: Backend.FieldError[] } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
  }

  static unauthorized(message: string = 'Thông tin xác thực không hợp lệ.'): AppError {
    return new AppError(message, 401);
  }

  static badRequest(message: string = 'Dữ liệu yêu cầu không hợp lệ.', options: { code?: Backend.MessageCode; fieldErrors?: Backend.FieldError[] } = {}): AppError {
    return new AppError(message, 400, options);
  }

  static forbidden(message: string = 'Bạn không có quyền thực hiện thao tác này.'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message: string = 'Không tìm thấy dữ liệu yêu cầu.'): AppError {
    return new AppError(message, 404);
  }

  static conflict(message: string, options: { code?: Backend.MessageCode; fieldErrors?: Backend.FieldError[] } = {}): AppError {
    return new AppError(message, 409, options);
  }

  static fieldError(statusCode: number, fieldError: Backend.FieldError): AppError {
    return new AppError(fieldError.message, statusCode, { code: fieldError.code, fieldErrors: [fieldError] });
  }
}
