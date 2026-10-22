import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import LeaderboardConstant from '../constant/LeaderboardConstant.ts';
import LeaderboardService from '../service/LeaderboardService.ts';

export default class LeaderboardController {
  static async getCurrent(request: Request, response: Response): Promise<Response> {
    const { query } = request.validated as unknown as { query: Backend.LeaderboardQuery };
    const viewer = request.auth?.user as Backend.UserDTO;
    return ApiResponse.sendSuccessResponse(response, { data: await LeaderboardService.getCurrent(viewer, query) });
  }

  static async refresh(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await LeaderboardService.refresh(), message: LeaderboardConstant.messages.REFRESHED });
  }
}
