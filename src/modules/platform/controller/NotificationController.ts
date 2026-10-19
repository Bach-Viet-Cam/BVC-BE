import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import NotificationService from '../service/NotificationService.ts';

export default class NotificationController {
  static getActorId(request: Request): string {
    return (request.auth as { user: Backend.UserDTO }).user.userId;
  }

  static async list(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { query: Backend.NotificationListQuery };
    return ApiResponse.sendSuccessResponse(response, { data: await NotificationService.list(validated.query) });
  }

  static async create(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.NotificationInput };
    const item = await NotificationService.create(NotificationController.getActorId(request), validated.body);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: item, message: PlatformConstant.notificationStatusMessages[item.status] });
  }

  static async update(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.NotificationInput; params: { id: string } };
    const item = await NotificationService.update(validated.params.id, validated.body);
    return ApiResponse.sendSuccessResponse(response, { data: item, message: PlatformConstant.notificationStatusMessages[item.status] });
  }

  static async send(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    const item = await NotificationService.send(validated.params.id);
    return ApiResponse.sendSuccessResponse(response, { data: item, message: PlatformConstant.notificationStatusMessages.SENT });
  }

  static async remove(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await NotificationService.remove(validated.params.id),
      message: PlatformConstant.messages.NOTIFICATION_DELETED
    });
  }
}
