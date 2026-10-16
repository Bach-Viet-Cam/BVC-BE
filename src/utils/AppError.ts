import MessageConstant from '../constants/MessageConstant.ts';

export default class AppError extends Error {
  readonly statusCode: number;
  readonly code?: Backend.MessageCode;
  readonly field?: string;

  constructor(message: string, statusCode: number = 500, code?: Backend.MessageCode, field?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
  }

  static unauthorized(message: string = 'Thông tin xác thực không hợp lệ.'): AppError {
    return new AppError(message, 401);
  }

  static badRequest(message: string = 'Dữ liệu yêu cầu không hợp lệ.'): AppError {
    return new AppError(message, 400);
  }

  static forbidden(message: string = 'Bạn không có quyền thực hiện thao tác này.'): AppError {
    return new AppError(message, 403);
  }

  // Error that carries a system message code (MSG-xx) with its Vietnamese text already filled in
  static withMessage(
    statusCode: number,
    code: Backend.MessageCode,
    params: Record<string, string | number> = {},
    field?: string
  ): AppError {
    return new AppError(MessageConstant.format(code, params), statusCode, code, field);
  }
}
