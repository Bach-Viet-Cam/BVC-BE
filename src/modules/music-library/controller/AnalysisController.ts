import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AnalysisService from '../service/AnalysisService.ts';

// TODO(AI): chưa gắn route, xem MusicLibraryRoute.register
export default class AnalysisController {
  static async handleCallback(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const callbackInput = request.validated!.body as MusicLibrary.AnalysisCallbackInput;
    return ApiResponse.sendSuccessResponse(response, { data: await AnalysisService.handleCallback(id, callbackInput) });
  }
}
