import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import MyNotificationService from '../service/MyNotificationService.ts';

export default class MyNotificationController {
  static getUserId(request: Request): string {
    return (request.auth as { user: Backend.UserDTO }).user.userId;
  }

  static async list(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { query: Backend.MyNotificationListQuery };
    return ApiResponse.sendSuccessResponse(response, { data: await MyNotificationService.list(MyNotificationController.getUserId(request), validated.query) });
  }

  static async countUnread(request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await MyNotificationService.countUnread(MyNotificationController.getUserId(request)) });
  }

  static async markRead(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, { data: await MyNotificationService.markRead(MyNotificationController.getUserId(request), validated.params.id) });
  }

  static async markAllRead(request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, {
      data: await MyNotificationService.markAllRead(MyNotificationController.getUserId(request)),
      message: PlatformConstant.messages.NOTIFICATIONS_ALL_READ
    });
  }
}
