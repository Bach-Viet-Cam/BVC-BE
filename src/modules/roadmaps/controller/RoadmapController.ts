import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import RoadmapConstant from '../constant/RoadmapConstant.ts';
import RoadmapService from '../service/RoadmapService.ts';

interface ValidatedRequest<TBody = unknown, TParams = unknown, TQuery = unknown> {
  body: TBody;
  params: TParams;
  query: TQuery;
}

export default class RoadmapController {
  static getValidated<TBody = unknown, TParams = unknown, TQuery = unknown>(request: Request): ValidatedRequest<TBody, TParams, TQuery> {
    return request.validated as ValidatedRequest<TBody, TParams, TQuery>;
  }

  static getUser(request: Request): Backend.UserDTO {
    return request.auth?.user as Backend.UserDTO;
  }

  static async listInstruments(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await RoadmapService.listInstruments() });
  }

  static async getEditableRoadmap(request: Request, response: Response): Promise<Response> {
    const { params } = RoadmapController.getValidated<unknown, { instrumentId: string }>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await RoadmapService.getEditableRoadmap(params.instrumentId) });
  }

  static async listFingerExercises(request: Request, response: Response): Promise<Response> {
    const { params, query } = RoadmapController.getValidated<unknown, { instrumentId: string }, { q?: string }>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await RoadmapService.listFingerExercises(params.instrumentId, query.q) });
  }

  static async getClassRoadmap(request: Request, response: Response): Promise<Response> {
    const { params } = RoadmapController.getValidated<unknown, { id: string }>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await RoadmapService.getClassRoadmap(params.id, RoadmapController.getUser(request)) });
  }

  static async saveVersion(request: Request, response: Response): Promise<Response> {
    const { body, params } = RoadmapController.getValidated<{ weeks: Backend.RoadmapWeekInput[]; baseVersion: number | null }, { instrumentId: string }>(request);
    const roadmap = await RoadmapService.saveVersion(params.instrumentId, RoadmapController.getUser(request).userId, body.weeks, body.baseVersion);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: roadmap, message: RoadmapConstant.messages.ROADMAP_SAVED });
  }
}
