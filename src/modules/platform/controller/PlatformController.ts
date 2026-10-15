import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import PlatformService from '../service/PlatformService.ts';

export default class PlatformController {
  static async listInstruments(request: Request, response: Response): Promise<Response> {
    const { query } = request.validated as { query: { active: 'true' | 'false' } };
    const instruments = await PlatformService.listInstruments(query.active === 'true');
    return ApiResponse.sendSuccessResponse(response, { data: instruments });
  }
}
