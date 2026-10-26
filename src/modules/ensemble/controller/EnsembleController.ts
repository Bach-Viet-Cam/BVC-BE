import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import EnsembleService from '../service/EnsembleService.ts';

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
}
