import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSegmentService from '../service/PracticeSegmentService.ts';
import SegmentProgressService from '../service/SegmentProgressService.ts';

export default class PracticeSegmentController {
  constructor(private readonly segments: PracticeSegmentService, private readonly progress: SegmentProgressService) {}

  readonly create = async (request: Request, response: Response): Promise<Response> => {
    const { params, body } = request.validated as { params: { id: string }; body: { startSec: number; endSec: number; studentUploadId: string } };
    const segment = await this.segments.create(request.auth!.user.userId, params.id, body);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: segment, message: PracticeConstant.messages.SENT });
  };

  readonly get = async (request: Request, response: Response): Promise<Response> => {
    const { params } = request.validated as { params: { segmentId: string } };
    return ApiResponse.sendSuccessResponse(response, { data: await this.segments.get(request.auth!.user.userId, params.segmentId) });
  };

  readonly list = async (request: Request, response: Response): Promise<Response> => {
    const { params, query } = request.validated as { params: { id: string }; query: { cursor?: string; limit: number } };
    return ApiResponse.sendSuccessResponse(response, { data: await this.segments.list(request.auth!.user.userId, params.id, query) });
  };

  readonly receiveProgress = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: { isApplied: await this.progress.apply((request.validated as { body: Practice.SegmentProgressCallback }).body) }
  });
}
