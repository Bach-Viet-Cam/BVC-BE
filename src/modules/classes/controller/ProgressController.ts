import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import ProgressService, { type ProgressQuery } from '../service/ProgressService.ts';

export default class ProgressController {
  static getTeacherId(request: Request): string {
    return (request.auth as { user: Backend.UserDTO }).user.userId;
  }

  static async listClasses(request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await ProgressService.listOwnedClasses(ProgressController.getTeacherId(request)) });
  }

  static async getProgress(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { classId: string }; query: ProgressQuery };
    return ApiResponse.sendSuccessResponse(response, {
      data: await ProgressService.getClassProgress(validated.params.classId, ProgressController.getTeacherId(request), validated.query)
    });
  }
}
