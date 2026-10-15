import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import UserService from '../service/UserService.ts';

export default class UserController {
  static getActorId(request: Request): string {
    return (request.auth as { user: Backend.UserDTO }).user.userId;
  }

  static async list(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { query: Backend.UserListQuery };
    return ApiResponse.sendSuccessResponse(response, { data: await UserService.list(validated.query) });
  }

  static async create(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.UserCreateInput };
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await UserService.create(validated.body),
      message: PlatformConstant.messages.USER_CREATED
    });
  }

  static async update(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.UserUpdateInput; params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await UserService.update(UserController.getActorId(request), validated.params.id, validated.body),
      message: PlatformConstant.messages.USER_UPDATED
    });
  }

  static async lock(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await UserService.lock(UserController.getActorId(request), validated.params.id),
      message: PlatformConstant.messages.USER_LOCKED
    });
  }

  static async unlock(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await UserService.unlock(validated.params.id),
      message: PlatformConstant.messages.USER_UNLOCKED
    });
  }
}
