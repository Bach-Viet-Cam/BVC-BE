import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import UploadService from '../service/UploadService.ts';

export default class UploadController {
  static async createPresignedUpload(request: Request, response: Response): Promise<Response> {
    const presignRequest = request.validated!.body as MusicLibrary.PresignRequest;
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await UploadService.createPresignedUpload(request.auth!.user.userId, presignRequest)
    });
  }

  static async uploadContent(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    await UploadService.storeContent(request.auth!.user.userId, id, request);
    return ApiResponse.sendSuccessResponse(response, { data: { fileId: id } });
  }

  static async confirmUpload(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    return ApiResponse.sendSuccessResponse(response, { data: await UploadService.confirmUpload(request.auth!.user.userId, id) });
  }
}
