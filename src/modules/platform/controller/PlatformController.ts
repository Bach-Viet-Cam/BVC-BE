import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import GradingSettingsService from '../service/GradingSettingsService.ts';
import PlatformService from '../service/PlatformService.ts';

export default class PlatformController {
  static async listInstruments(request: Request, response: Response): Promise<Response> {
    const { query } = request.validated as { query: { active: 'true' | 'false' } };
    const instruments = await PlatformService.listInstruments(query.active === 'true');
    return ApiResponse.sendSuccessResponse(response, { data: instruments });
  }

  static async getGradingSettings(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await GradingSettingsService.getGradingSettings() });
  }

  static async updateGradingSettings(request: Request, response: Response): Promise<Response> {
    const { body } = request.validated as { body: { minAccuracy: number; atRiskMargin: number } };
    const adminId = (request.auth?.user as Backend.UserDTO).userId;
    const settings = await GradingSettingsService.updateGradingSettings(adminId, body);
    return ApiResponse.sendSuccessResponse(response, { data: settings, message: PlatformConstant.messages.GRADING_SAVED });
  }
}
