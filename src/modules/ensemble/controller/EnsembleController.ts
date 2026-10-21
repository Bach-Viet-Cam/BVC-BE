import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import EnsembleConstant from '../constant/EnsembleConstant.ts';
import EnsembleService, { type CreateSessionInput } from '../service/EnsembleService.ts';

export default class EnsembleController {
  static getStudentId(request: Request): string {
    return (request.auth as { user: Backend.UserDTO }).user.userId;
  }

  static async getTracks(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { pieceId: string }; query: { assignmentId?: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await EnsembleService.getTracks(EnsembleController.getStudentId(request), validated.params.pieceId, validated.query.assignmentId)
    });
  }

  static async createSession(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: CreateSessionInput };
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await EnsembleService.createSession(EnsembleController.getStudentId(request), validated.body, request.file),
      message: EnsembleConstant.messages.SESSION_SAVED
    });
  }

  static async getSession(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, { data: await EnsembleService.getSession(EnsembleController.getStudentId(request), validated.params.id) });
  }
}
