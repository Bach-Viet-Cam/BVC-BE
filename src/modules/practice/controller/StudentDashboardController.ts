import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import StudentDashboardService from '../service/StudentDashboardService.ts';

export default class StudentDashboardController {
  constructor(private readonly dashboard: StudentDashboardService) {}

  readonly get = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.dashboard.get(request.auth!.user.userId)
  });
}
