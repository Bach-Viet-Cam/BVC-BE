import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import SubmissionCompareService from '../service/SubmissionCompareService.ts';

export default class SubmissionCompareController {
  constructor(private readonly comparisons: SubmissionCompareService) {}

  readonly compare = async (request: Request, response: Response): Promise<Response> => {
    const { a, b } = (request.validated as { query: { a: string; b: string } }).query;
    return ApiResponse.sendSuccessResponse(response, { data: await this.comparisons.compare(request.auth!.user.userId, a, b) });
  };
}
