import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AudioUploadService from '../service/AudioUploadService.ts';
import AudioEvaluationService from '../service/AudioEvaluationService.ts';

export default class AudioController {
  constructor(private readonly uploads: AudioUploadService, private readonly evaluations: AudioEvaluationService) {}

  readonly upload = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    statusCode: 201, data: await this.uploads.upload(request.auth!.user.userId, request.file), message: 'Đã tải audio lên.'
  });

  readonly create = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    statusCode: 202, data: await this.evaluations.create(request.auth!.user.userId, (request.validated as { body: Audio.EvaluationInput }).body), message: 'Đã gửi yêu cầu phân tích.'
  });

  readonly get = async (request: Request, response: Response): Promise<Response> => ApiResponse.sendSuccessResponse(response, {
    data: await this.evaluations.get(request.auth!.user.userId, (request.validated as { params: { evaluationId: string } }).params.evaluationId)
  });
}
