import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeResultService from '../service/PracticeResultService.ts';

export default class PracticeResultController {
  constructor(private readonly results: PracticeResultService) {}

  readonly getResult = async (request: Request, response: Response): Promise<Response> => {
    const result = await this.results.getResult(request.auth!.user.userId, this.readId(request));
    return ApiResponse.sendSuccessResponse(response, {
      data: result,
      message: result.submission.status === 'PROCESSING' ? PracticeConstant.messages.RESULT_PROCESSING : ''
    });
  };

  readonly getHistory = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.results.getHistory(request.auth!.user.userId, this.readId(request))
  });

  readonly getClassRank = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.results.getClassRank(request.auth!.user.userId, this.readId(request))
  });

  readonly getPitchChart = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.results.getPitchChart(request.auth!.user.userId, this.readId(request))
  });

  private readId(request: Request): string {
    return (request.validated as { params: { id: string } }).params.id;
  }
}
