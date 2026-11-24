import type { Request, Response } from 'express';
import type { z } from 'zod';
import ApiResponse from '../../../utils/ApiResponse.ts';
import LlmKeyService from '../service/LlmKeyService.ts';
import LlmKeyValidation from '../validation/LlmKeyValidation.ts';
import LlmKeyDTO from '../dto/LlmKeyDTO.ts';

export default class LlmKeyController {
  static async list(_request: Request, response: Response): Promise<Response> {
    const items = await LlmKeyService.list();
    return ApiResponse.sendSuccessResponse(response, { data: { items: items.map((row) => LlmKeyDTO.item(row)) } });
  }
  static async create(request: Request, response: Response): Promise<Response> {
    const { body } = request.validated as z.infer<typeof LlmKeyValidation.create>;
    const item = await LlmKeyService.create(request.auth!.user.userId, body);
    return ApiResponse.sendSuccessResponse(response, { data: LlmKeyDTO.item(item), message: 'Đã thêm API key.', statusCode: 201 });
  }
  static async update(request: Request, response: Response): Promise<Response> {
    const { body, params } = request.validated as z.infer<typeof LlmKeyValidation.update>;
    const item = await LlmKeyService.update(request.auth!.user.userId, params.id, body);
    return ApiResponse.sendSuccessResponse(response, { data: LlmKeyDTO.item(item), message: 'Đã cập nhật API key.' });
  }
  static async remove(request: Request, response: Response): Promise<Response> {
    const { params } = request.validated as z.infer<typeof LlmKeyValidation.id>;
    await LlmKeyService.remove(request.auth!.user.userId, params.id);
    return ApiResponse.sendSuccessResponse(response, { data: null, message: 'Đã xóa API key.' });
  }
}
