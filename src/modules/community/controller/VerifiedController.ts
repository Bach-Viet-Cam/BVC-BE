import type { Request, Response } from 'express';
import type { z } from 'zod';
import ApiResponse from '../../../utils/ApiResponse.ts';
import VerifiedValidation from '../validation/VerifiedValidation.ts';
import SubmissionReviewService from '../service/SubmissionReviewService.ts';
import VerifiedContentService from '../service/VerifiedContentService.ts';

export default class VerifiedController {
  static async review(request: Request, response: Response): Promise<Response> {
    const { params, body } = request.validated as z.infer<typeof VerifiedValidation.review>;
    const actor = request.auth!.user;
    const data = request.method === 'GET' ? await SubmissionReviewService.get(actor, params.id) : await SubmissionReviewService.decide(actor, params.id, body);
    return ApiResponse.sendSuccessResponse(response, { data });
  }
  static async consent(request: Request, response: Response): Promise<Response> {
    const { params, body } = request.validated as z.infer<typeof VerifiedValidation.consent>;
    return ApiResponse.sendSuccessResponse(response, { data: await SubmissionReviewService.consent(request.auth!.user, params.id, body.isGranted), message: 'Đã cập nhật quyền chia sẻ bản thu.' });
  }
  static async list(request: Request, response: Response): Promise<Response> {
    const { query, params } = request.validated as z.infer<typeof VerifiedValidation.library>;
    return ApiResponse.sendSuccessResponse(response, { data: await VerifiedContentService.list(request.auth!.user, query, params.id) });
  }
  static async detail(request: Request, response: Response): Promise<Response> {
    const { params } = request.validated as z.infer<typeof VerifiedValidation.id>;
    return ApiResponse.sendSuccessResponse(response, { data: await VerifiedContentService.get(request.auth!.user, params.id) });
  }
  static async mutate(request: Request, response: Response): Promise<Response> {
    const { params, body } = request.validated as z.infer<typeof VerifiedValidation.mutation>;
    return ApiResponse.sendSuccessResponse(response, { data: await VerifiedContentService.mutate(request.auth!.user, params.id, body, request.path.endsWith('/revoke')), message: 'Đã cập nhật nội dung xác minh.' });
  }
  static async audio(request: Request, response: Response): Promise<void> {
    const { params } = request.validated as z.infer<typeof VerifiedValidation.id>;
    const file = await VerifiedContentService.audio(request.auth!.user, params.id, request.path.startsWith('/submissions/'));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.type(file.contentType);
    await new Promise<void>((resolve, reject) => response.sendFile(file.path, { cacheControl: false }, (error) => error ? reject(error) : resolve()));
  }
}
