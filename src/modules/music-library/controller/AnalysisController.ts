import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AnalysisService from '../service/AnalysisService.ts';
import MockAiService from '../service/MockAiService.ts';

export default class AnalysisController {
  static async handleCallback(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const callbackInput = request.validated!.body as MusicLibrary.AnalysisCallbackInput;
    return ApiResponse.sendSuccessResponse(response, { data: await AnalysisService.handleCallback(id, callbackInput) });
  }

  // ----- Mock AI service (development only) -----
  static async acceptMockJob(request: Request, response: Response): Promise<Response> {
    const { jobId, sheetMusicId, callbackUrl } = request.body as { jobId: string; sheetMusicId: string; callbackUrl: string };
    MockAiService.acceptJob({ jobId, sheetMusicId, callbackUrl });
    return ApiResponse.sendSuccessResponse(response, { statusCode: 202, data: { jobId } });
  }

  static async cancelMockJob(request: Request, response: Response): Promise<Response> {
    MockAiService.cancelJob(String(request.params.jobId));
    return ApiResponse.sendSuccessResponse(response, { data: null });
  }
}
