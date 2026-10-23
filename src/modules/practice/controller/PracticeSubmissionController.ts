import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSubmissionService from '../service/PracticeSubmissionService.ts';
import PracticeContextService from '../service/PracticeContextService.ts';
import SubmissionProgressService from '../service/SubmissionProgressService.ts';

export default class PracticeSubmissionController {
  constructor(
    private readonly submissions: PracticeSubmissionService,
    private readonly progress: SubmissionProgressService,
    private readonly context: PracticeContextService
  ) {}

  readonly create = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    statusCode: 202,
    data: await this.submissions.create(request.auth!.user.userId, (request.validated as { body: Practice.CreateInput }).body),
    message: PracticeConstant.messages.SENT
  });

  readonly getContext = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.context.get(request.auth!.user.userId, (request.validated as { query: { pieceId: string; sheetMusicId: string; assignmentId?: string } }).query)
  });

  readonly getActive = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.submissions.getActive(request.auth!.user.userId, (request.validated as { query: { pieceId: string } }).query.pieceId)
  });

  readonly get = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.submissions.get(request.auth!.user.userId, (request.validated as { params: { id: string } }).params.id)
  });

  readonly retry = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    statusCode: 202,
    data: await this.submissions.retry(request.auth!.user.userId, (request.validated as { params: { id: string } }).params.id),
    message: PracticeConstant.messages.RETRYING
  });

  readonly receiveProgress = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: { isApplied: await this.progress.apply((request.validated as { body: Practice.ProgressCallback }).body) }
  });
}
