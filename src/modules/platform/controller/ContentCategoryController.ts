import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import ContentCategoryService from '../service/ContentCategoryService.ts';

export default class ContentCategoryController {
  static async list(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await ContentCategoryService.list() });
  }

  static async create(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.ContentCategoryInput };
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await ContentCategoryService.create(validated.body),
      message: PlatformConstant.messages.CATEGORY_CREATED
    });
  }

  static async rename(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.ContentCategoryUpdateInput; params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await ContentCategoryService.rename(validated.params.id, validated.body),
      message: PlatformConstant.messages.CATEGORY_UPDATED
    });
  }

  static async remove(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await ContentCategoryService.remove(validated.params.id),
      message: PlatformConstant.messages.CATEGORY_DELETED
    });
  }
}
