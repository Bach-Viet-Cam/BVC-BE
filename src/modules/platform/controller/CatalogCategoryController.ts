import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import CatalogCategoryService from '../service/CatalogCategoryService.ts';

const MESSAGES = PlatformConstant.messages;

export default class CatalogCategoryController {
  static async list(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { query: Backend.CatalogCategoryListQuery };
    return ApiResponse.sendSuccessResponse(response, { data: await CatalogCategoryService.list(validated.query) });
  }

  static async create(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.CatalogCategoryInput };
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await CatalogCategoryService.create(validated.body),
      message: MESSAGES.CATEGORY_CREATED
    });
  }

  static async update(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.CatalogCategoryUpdateInput; params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await CatalogCategoryService.update(validated.params.id, validated.body),
      message: MESSAGES.CATEGORY_UPDATED
    });
  }

  static async deactivate(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await CatalogCategoryService.setActive(validated.params.id, false),
      message: MESSAGES.CATALOG_CATEGORY_DEACTIVATED
    });
  }

  static async activate(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await CatalogCategoryService.setActive(validated.params.id, true),
      message: MESSAGES.CATALOG_CATEGORY_ACTIVATED
    });
  }

  static async remove(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await CatalogCategoryService.remove(validated.params.id),
      message: MESSAGES.CATEGORY_DELETED
    });
  }
}
