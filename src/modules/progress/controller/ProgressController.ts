import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import ProgressService from '../service/ProgressService.ts';

interface ValidatedRequest<TParams = unknown, TQuery = unknown> {
  params: TParams;
  query: TQuery;
}

export default class ProgressController {
  static getValidated<TParams = unknown, TQuery = unknown>(request: Request): ValidatedRequest<TParams, TQuery> {
    return request.validated as unknown as ValidatedRequest<TParams, TQuery>;
  }

  static getUser(request: Request): Backend.UserDTO {
    return request.auth?.user as Backend.UserDTO;
  }

  static async getClassProgress(request: Request, response: Response): Promise<Response> {
    const { params } = ProgressController.getValidated<{ id: string }>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await ProgressService.getClassProgress(params.id, ProgressController.getUser(request).userId) });
  }

  static async getStudentSummary(request: Request, response: Response): Promise<Response> {
    const { params } = ProgressController.getValidated<{ id: string; studentId: string }>(request);
    const summary = await ProgressService.getStudentSummary(params.id, params.studentId, ProgressController.getUser(request));
    return ApiResponse.sendSuccessResponse(response, { data: summary });
  }

  static async getStudentHistory(request: Request, response: Response): Promise<Response> {
    const { params, query } = ProgressController.getValidated<{ id: string; studentId: string }, Backend.StudentHistoryQuery>(request);
    const history = await ProgressService.getStudentHistory(params.id, params.studentId, ProgressController.getUser(request), query);
    return ApiResponse.sendSuccessResponse(response, { data: history });
  }
}
