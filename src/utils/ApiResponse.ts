import type { Response } from 'express';

export default class ApiResponse {
  static sendSuccessResponse<TData>(response: Response, { statusCode = 200, data, message = '' }: Backend.ApiResponseOptions<TData>) {
    return response.status(statusCode).json({
      success: true,
      data,
      message
    });
  }
}
