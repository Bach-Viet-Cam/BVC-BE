import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import SystemConfigService from '../service/SystemConfigService.ts';

export default class SystemConfigController {
  static async list(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { query: Backend.SystemConfigListQuery };
    return ApiResponse.sendSuccessResponse(response, { data: await SystemConfigService.list(validated.query) });
  }

  static async update(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: { value: string }; params: { id: string } };
    const actorId = (request.auth as { user: Backend.UserDTO }).user.userId;
    return ApiResponse.sendSuccessResponse(response, {
      data: await SystemConfigService.updateValue(validated.params.id, validated.body.value, actorId),
      message: PlatformConstant.messages.CONFIG_UPDATED
    });
  }
}
