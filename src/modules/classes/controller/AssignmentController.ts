import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AssignmentService, { type MyAssignmentsQuery } from '../service/AssignmentService.ts';

export default class AssignmentController {
  static getStudentId(request: Request): string {
    return (request.auth as { user: Backend.UserDTO }).user.userId;
  }

  static async listMine(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { query: MyAssignmentsQuery };
    return ApiResponse.sendSuccessResponse(response, { data: await AssignmentService.listMine(AssignmentController.getStudentId(request), validated.query) });
  }

  static async getDetail(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, { data: await AssignmentService.getDetail(AssignmentController.getStudentId(request), validated.params.id) });
  }
}
