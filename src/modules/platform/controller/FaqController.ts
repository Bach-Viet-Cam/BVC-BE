import type { Request, Response } from 'express';
import type { z } from 'zod';
import ApiResponse from '../../../utils/ApiResponse.ts';
import FaqService from '../service/FaqService.ts';
import FaqValidation from '../validation/FaqValidation.ts';
import FaqDTO from '../dto/FaqDTO.ts';

export default class FaqController {
  static async list(request: Request, response: Response): Promise<Response> {
    const { query } = request.validated as z.infer<typeof FaqValidation.list>;
    const result = await FaqService.list(query, request.path.startsWith('/admin/'));
    return ApiResponse.sendSuccessResponse(response, { data: { ...result, items: result.items.map((row) => FaqDTO.item(row)) } });
  }
  static async save(request: Request, response: Response): Promise<Response> {
    const { body, params } = request.validated as z.infer<typeof FaqValidation.update>;
    return ApiResponse.sendSuccessResponse(response, { data: await FaqService.save(params.id ?? null, request.auth!.user.userId, body), message: 'Đã lưu câu hỏi.', statusCode: request.method === 'POST' ? 201 : 200 });
  }
  static async remove(request: Request, response: Response): Promise<Response> {
    const { params } = request.validated as z.infer<typeof FaqValidation.id>;
    await FaqService.remove(params.id, request.auth!.user.userId);
    return ApiResponse.sendSuccessResponse(response, { data: null, message: 'Đã xóa câu hỏi.' });
  }
}
