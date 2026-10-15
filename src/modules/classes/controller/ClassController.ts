import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassService from '../service/ClassService.ts';
import ImportService from '../service/ImportService.ts';
import MemberService from '../service/MemberService.ts';

const messages = ClassConstant.messages;

interface ValidatedRequest<TBody = unknown, TParams = unknown, TQuery = unknown> {
  body: TBody;
  params: TParams;
  query: TQuery;
}

export default class ClassController {
  static getLecturerId(request: Request): string {
    return (request.auth?.user as Backend.UserDTO).userId;
  }

  static getValidated<TBody = unknown, TParams = unknown, TQuery = unknown>(request: Request): ValidatedRequest<TBody, TParams, TQuery> {
    return request.validated as ValidatedRequest<TBody, TParams, TQuery>;
  }

  static async listClasses(request: Request, response: Response): Promise<Response> {
    const { query } = ClassController.getValidated<unknown, unknown, Backend.ClassListQuery>(request);
    const result = await ClassService.listOwnClasses(ClassController.getLecturerId(request), query);
    return ApiResponse.sendSuccessResponse(response, { data: result });
  }

  static async createClass(request: Request, response: Response): Promise<Response> {
    const { body } = ClassController.getValidated<Backend.CreateClassInput>(request);
    const classDetail = await ClassService.createClass(ClassController.getLecturerId(request), body);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: classDetail, message: messages.CLASS_CREATED });
  }

  static async getClass(request: Request, response: Response): Promise<Response> {
    const { params } = ClassController.getValidated<unknown, { id: string }>(request);
    const classDetail = await ClassService.getClassDetail(params.id, ClassController.getLecturerId(request));
    return ApiResponse.sendSuccessResponse(response, { data: classDetail });
  }

  static async updateClass(request: Request, response: Response): Promise<Response> {
    const { body, params } = ClassController.getValidated<Backend.UpdateClassInput, { id: string }>(request);
    const classDetail = await ClassService.updateClass(params.id, ClassController.getLecturerId(request), body);
    return ApiResponse.sendSuccessResponse(response, { data: classDetail, message: messages.CLASS_UPDATED });
  }

  static async endClass(request: Request, response: Response): Promise<Response> {
    const { params } = ClassController.getValidated<unknown, { id: string }>(request);
    const classDetail = await ClassService.endClass(params.id, ClassController.getLecturerId(request));
    return ApiResponse.sendSuccessResponse(response, { data: classDetail, message: messages.CLASS_ENDED });
  }

  static async listMembers(request: Request, response: Response): Promise<Response> {
    const { params, query } = ClassController.getValidated<unknown, { id: string }, Backend.MemberListQuery>(request);
    const result = await MemberService.listMembers(params.id, ClassController.getLecturerId(request), query);
    return ApiResponse.sendSuccessResponse(response, { data: result });
  }

  static async addMember(request: Request, response: Response): Promise<Response> {
    const { body, params } = ClassController.getValidated<Backend.StudentRowInput, { id: string }>(request);
    const member = await MemberService.addMember(params.id, ClassController.getLecturerId(request), body);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: member, message: messages.MEMBER_ADDED });
  }

  static async removeMember(request: Request, response: Response): Promise<Response> {
    const { params } = ClassController.getValidated<unknown, { id: string; studentId: string }>(request);
    await MemberService.removeMember(params.id, ClassController.getLecturerId(request), params.studentId);
    return ApiResponse.sendSuccessResponse(response, { data: null, message: messages.MEMBER_REMOVED });
  }

  static async downloadImportTemplate(_request: Request, response: Response): Promise<Response> {
    const templateBuffer = await ImportService.buildTemplate();
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${ClassConstant.importFile.TEMPLATE_FILE_NAME}"`);
    return response.status(200).send(templateBuffer);
  }

  static async previewImport(request: Request, response: Response): Promise<Response> {
    const { params } = ClassController.getValidated<unknown, { id: string }>(request);
    const preview = await ImportService.previewImport(params.id, ClassController.getLecturerId(request), request.file as Backend.UploadedImportFile);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: preview });
  }

  static async confirmImport(request: Request, response: Response): Promise<Response> {
    const { params } = ClassController.getValidated<unknown, { id: string; logId: string }>(request);
    const { message, ...result } = await ImportService.confirmImport(params.id, ClassController.getLecturerId(request), params.logId);
    return ApiResponse.sendSuccessResponse(response, { data: result, message });
  }

  static async cancelImport(request: Request, response: Response): Promise<Response> {
    const { params } = ClassController.getValidated<unknown, { id: string; logId: string }>(request);
    await ImportService.cancelImport(params.id, ClassController.getLecturerId(request), params.logId);
    return ApiResponse.sendSuccessResponse(response, { data: null, message: messages.IMPORT_CANCELLED });
  }
}
