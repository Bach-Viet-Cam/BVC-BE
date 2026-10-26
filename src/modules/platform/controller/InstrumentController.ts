import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import InstrumentService from '../service/InstrumentService.ts';

export default class InstrumentController {
  static async list(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { query: Backend.InstrumentListQuery };
    const isAdmin = request.auth?.user.role === AuthConstant.roles.SYSTEM_ADMIN;
    const query: Backend.InstrumentListQuery = isAdmin ? validated.query : { ...validated.query, status: 'active' };
    return ApiResponse.sendSuccessResponse(response, { data: await InstrumentService.list(query) });
  }

  static async create(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.InstrumentInput };
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await InstrumentService.create(validated.body),
      message: PlatformConstant.messages.INSTRUMENT_CREATED
    });
  }

  static async update(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: Backend.InstrumentUpdateInput; params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await InstrumentService.update(validated.params.id, validated.body),
      message: PlatformConstant.messages.INSTRUMENT_UPDATED
    });
  }

  static async deactivate(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await InstrumentService.setActive(validated.params.id, false),
      message: PlatformConstant.messages.INSTRUMENT_DEACTIVATED
    });
  }

  static async activate(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await InstrumentService.setActive(validated.params.id, true),
      message: PlatformConstant.messages.INSTRUMENT_ACTIVATED
    });
  }

  static async getTunes(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await InstrumentService.getTunes(validated.params.id)
    });
  }

  static async setTunes(request: Request, response: Response): Promise<Response> {
    const validated = request.validated as { body: { tunes: Backend.InstrumentTuneInput[] }; params: { id: string } };
    return ApiResponse.sendSuccessResponse(response, {
      data: await InstrumentService.setTunes(validated.params.id, validated.body.tunes),
      message: PlatformConstant.messages.INSTRUMENT_TUNES_UPDATED
    });
  }
}

