import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import AssignmentQueryService from '../service/AssignmentQueryService.ts';
import AssignmentService from '../service/AssignmentService.ts';
import SubmissionCommentService from '../service/SubmissionCommentService.ts';

const messages = AssignmentConstant.messages;

interface ValidatedRequest<TBody = unknown, TParams = unknown, TQuery = unknown> {
  body: TBody;
  params: TParams;
  query: TQuery;
}

export default class AssignmentController {
  static getValidated<TBody = unknown, TParams = unknown, TQuery = unknown>(request: Request): ValidatedRequest<TBody, TParams, TQuery> {
    return request.validated as ValidatedRequest<TBody, TParams, TQuery>;
  }

  static getLecturerId(request: Request): string {
    return (request.auth?.user as Backend.UserDTO).userId;
  }

  static async createAssignment(request: Request, response: Response): Promise<Response> {
    const { body } = AssignmentController.getValidated<Backend.CreateAssignmentInput>(request);
    const assignment = await AssignmentService.createAssignment(AssignmentController.getLecturerId(request), body);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: assignment, message: messages.CREATED });
  }

  static async updateAssignment(request: Request, response: Response): Promise<Response> {
    const { body, params } = AssignmentController.getValidated<Backend.AssignmentContentInput, { id: string }>(request);
    const assignment = await AssignmentService.updateAssignment(params.id, AssignmentController.getLecturerId(request), body);
    return ApiResponse.sendSuccessResponse(response, { data: assignment, message: messages.UPDATED });
  }

  static async publishAssignment(request: Request, response: Response): Promise<Response> {
    const { params } = AssignmentController.getValidated<unknown, { id: string }>(request);
    const assignment = await AssignmentService.publishAssignment(params.id, AssignmentController.getLecturerId(request));
    return ApiResponse.sendSuccessResponse(response, { data: assignment, message: messages.PUBLISHED });
  }

  static async closeAssignment(request: Request, response: Response): Promise<Response> {
    const { params } = AssignmentController.getValidated<unknown, { id: string }>(request);
    const assignment = await AssignmentService.closeAssignment(params.id, AssignmentController.getLecturerId(request));
    return ApiResponse.sendSuccessResponse(response, { data: assignment, message: messages.CLOSED });
  }

  static async reopenAssignment(request: Request, response: Response): Promise<Response> {
    const { params } = AssignmentController.getValidated<unknown, { id: string }>(request);
    const assignment = await AssignmentService.reopenAssignment(params.id, AssignmentController.getLecturerId(request));
    return ApiResponse.sendSuccessResponse(response, { data: assignment, message: messages.REOPENED });
  }

  static async deleteAssignment(request: Request, response: Response): Promise<Response> {
    const { params } = AssignmentController.getValidated<unknown, { id: string }>(request);
    await AssignmentService.deleteAssignment(params.id, AssignmentController.getLecturerId(request));
    return ApiResponse.sendSuccessResponse(response, { data: null, message: messages.DELETED });
  }

  static async listAssignments(request: Request, response: Response): Promise<Response> {
    const { query } = AssignmentController.getValidated<unknown, unknown, Backend.AssignmentListQuery>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await AssignmentQueryService.listAssignments(AssignmentController.getLecturerId(request), query) });
  }

  static async getAssignment(request: Request, response: Response): Promise<Response> {
    const { params } = AssignmentController.getValidated<unknown, { id: string }>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await AssignmentQueryService.getAssignmentDetail(params.id, AssignmentController.getLecturerId(request)) });
  }

  static async listClassSheetMusic(request: Request, response: Response): Promise<Response> {
    const { query } = AssignmentController.getValidated<unknown, unknown, { classId: string }>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await AssignmentQueryService.listClassSheetMusic(query.classId, AssignmentController.getLecturerId(request)) });
  }

  static async getStudentSubmissions(request: Request, response: Response): Promise<Response> {
    const { params } = AssignmentController.getValidated<unknown, { id: string; studentId: string }>(request);
    const result = await AssignmentQueryService.getStudentSubmissions(params.id, params.studentId, AssignmentController.getLecturerId(request));
    return ApiResponse.sendSuccessResponse(response, { data: result });
  }

  static async saveComment(request: Request, response: Response): Promise<Response> {
    const { body, params } = AssignmentController.getValidated<{ content: string }, { id: string }>(request);
    const { comment, message } = await SubmissionCommentService.saveComment(params.id, AssignmentController.getLecturerId(request), body.content);
    return ApiResponse.sendSuccessResponse(response, { data: comment, message });
  }
}
