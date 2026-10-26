import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PracticeSettingsService from '../service/PracticeSettingsService.ts';

export default class PracticeSettingsController {
  constructor(private readonly settings: PracticeSettingsService) {}

  readonly getTargetBpm = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.settings.getTargetBpm(request.auth!.user.userId, (request.validated as { query: { sheetMusicId: string; assignmentId?: string } }).query)
  });

  readonly getTunes = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.settings.getTunes((request.validated as { params: { sheetMusicId: string } }).params.sheetMusicId)
  });
}
