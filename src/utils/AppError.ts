export default class AppError extends Error {
  readonly statusCode: number;
  readonly details?: { evaluationId: string; status: string };

  constructor(message: string, statusCode: number = 500, details?: { evaluationId: string; status: string }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
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
}
