import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import StudentEvaluationService from '../service/StudentEvaluationService.ts';
import StudentStatsService from '../service/StudentStatsService.ts';

interface StudentParams {
  id: string;
  studentId: string;
}

export default class StudentStatsController {
  static getUserId(request: Request): string {
    return (request.auth?.user as Backend.UserDTO).userId;
  }

  static async getForLecturer(request: Request, response: Response): Promise<Response> {
    const { params } = request.validated as { params: StudentParams };
    const stats = await StudentStatsService.getForLecturer(params.id, params.studentId, StudentStatsController.getUserId(request));
    return ApiResponse.sendSuccessResponse(response, { data: stats });
  }

  static async getMine(request: Request, response: Response): Promise<Response> {
    const { query } = request.validated as { query: { classId?: string } };
    const stats = await StudentStatsService.getForStudent(StudentStatsController.getUserId(request), query.classId);
    return ApiResponse.sendSuccessResponse(response, { data: stats });
  }

  static async saveEvaluation(request: Request, response: Response): Promise<Response> {
    const { params, body } = request.validated as { params: StudentParams; body: { content: string } };
    const result = await StudentEvaluationService.save(params.id, params.studentId, StudentStatsController.getUserId(request), body.content);
    return ApiResponse.sendSuccessResponse(response, { data: { evaluation: result.evaluation }, message: result.message });
  }
}
