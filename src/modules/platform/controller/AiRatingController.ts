import type { Request, Response } from 'express';
import type { z } from 'zod';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AiRatingService from '../service/AiRatingService.ts';
import AiRatingRepository from '../repository/AiRatingRepository.ts';
import AiRatingValidation from '../validation/AiRatingValidation.ts';

export default class AiRatingController {
  static async current(request: Request, response: Response): Promise<Response> {
    const { params, body } = request.validated as z.infer<typeof AiRatingValidation.save>;
    const data = request.method === 'GET' ? await AiRatingService.get(request.auth!.user, params.id) : await AiRatingService.save(request.auth!.user, params.id, body);
    return ApiResponse.sendSuccessResponse(response, { data });
  }
  static async history(request: Request, response: Response): Promise<Response> {
    const { query } = request.validated as z.infer<typeof AiRatingValidation.list>;
    return ApiResponse.sendSuccessResponse(response, { data: await AiRatingRepository.history(query.page, query.role) });
  }
}
