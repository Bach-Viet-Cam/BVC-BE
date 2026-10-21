import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AdminStatsService from '../service/AdminStatsService.ts';

export default class AdminStatsController {
  static async overview(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await AdminStatsService.getOverview() });
  }

  static async monitoring(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await AdminStatsService.getMonitoring() });
  }
}
