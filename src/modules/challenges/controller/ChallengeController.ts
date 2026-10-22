import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import ChallengeConstant from '../constant/ChallengeConstant.ts';
import ChallengeQueryService from '../service/ChallengeQueryService.ts';
import ChallengeService from '../service/ChallengeService.ts';

const messages = ChallengeConstant.messages;

interface ValidatedRequest<TBody = unknown, TParams = unknown, TQuery = unknown> {
  body: TBody;
  params: TParams;
  query: TQuery;
}

export default class ChallengeController {
  static getValidated<TBody = unknown, TParams = unknown, TQuery = unknown>(request: Request): ValidatedRequest<TBody, TParams, TQuery> {
    return request.validated as ValidatedRequest<TBody, TParams, TQuery>;
  }

  static getLecturerId(request: Request): string {
    return (request.auth?.user as Backend.UserDTO).userId;
  }

  static async createChallenge(request: Request, response: Response): Promise<Response> {
    const { body } = ChallengeController.getValidated<Backend.ChallengeCreateBody>(request);
    const input: Backend.ChallengeInput = {
      title: body.title,
      description: body.description ?? null,
      instrumentId: body.instrumentId ?? null,
      pieceId: body.pieceId ?? null,
      classIds: body.classIds ?? [],
      weekStart: body.weekStart ?? null,
      minAccuracy: body.minAccuracy ?? null,
      requiredBpm: body.requiredBpm ?? null,
      maxSubmissions: body.maxSubmissions ?? ChallengeConstant.limits.MAX_SUBMISSIONS_DEFAULT,
      publish: body.publish
    };
    const challenge = await ChallengeService.create(ChallengeController.getLecturerId(request), input);
    return ApiResponse.sendSuccessResponse(response, { statusCode: 201, data: challenge, message: body.publish ? messages.PUBLISHED : messages.CREATED });
  }

  static async updateChallenge(request: Request, response: Response): Promise<Response> {
    const { body, params } = ChallengeController.getValidated<Backend.ChallengePatchInput, { id: string }>(request);
    const challenge = await ChallengeService.update(ChallengeController.getLecturerId(request), params.id, body);
    return ApiResponse.sendSuccessResponse(response, { data: challenge, message: messages.UPDATED });
  }

  static async deleteChallenge(request: Request, response: Response): Promise<Response> {
    const { params } = ChallengeController.getValidated<unknown, { id: string }>(request);
    await ChallengeService.remove(ChallengeController.getLecturerId(request), params.id);
    return ApiResponse.sendSuccessResponse(response, { data: null, message: messages.DELETED });
  }

  static async publishChallenge(request: Request, response: Response): Promise<Response> {
    const { params } = ChallengeController.getValidated<unknown, { id: string }>(request);
    const challenge = await ChallengeService.publish(ChallengeController.getLecturerId(request), params.id);
    return ApiResponse.sendSuccessResponse(response, { data: challenge, message: messages.PUBLISHED });
  }

  static async listChallenges(request: Request, response: Response): Promise<Response> {
    const { query } = ChallengeController.getValidated<unknown, unknown, Backend.ChallengeListQuery>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await ChallengeQueryService.list(ChallengeController.getLecturerId(request), query) });
  }

  static async getChallenge(request: Request, response: Response): Promise<Response> {
    const { params } = ChallengeController.getValidated<unknown, { id: string }>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await ChallengeQueryService.get(ChallengeController.getLecturerId(request), params.id) });
  }

  static async getFormMeta(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await ChallengeQueryService.getFormMeta() });
  }

  static async listPieces(request: Request, response: Response): Promise<Response> {
    const { query } = ChallengeController.getValidated<unknown, unknown, Backend.ChallengePieceQuery>(request);
    return ApiResponse.sendSuccessResponse(response, { data: await ChallengeQueryService.listReadyPieces(query) });
  }
}
