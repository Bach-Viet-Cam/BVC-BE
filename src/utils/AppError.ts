import MessageConstant from '../constants/MessageConstant.ts';

interface AppErrorOptions {
  code?: Backend.MessageCode;
  field?: string;
  details?: { evaluationId: string; status: string };
}

export default class AppError extends Error {
  readonly statusCode: number;
  readonly code?: Backend.MessageCode;
  readonly field?: string;
  readonly details?: { evaluationId: string; status: string };

  constructor(message: string, statusCode: number = 500, { code, field, details }: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
    this.details = details;
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

  static notFound(message: string = 'Không tìm thấy dữ liệu yêu cầu.'): AppError {
    return new AppError(message, 404);
  }

  static conflict(message: string = 'Dữ liệu đã tồn tại.'): AppError {
    return new AppError(message, 409);
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
