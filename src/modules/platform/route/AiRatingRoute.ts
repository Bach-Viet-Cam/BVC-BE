import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import AiRatingValidation from '../validation/AiRatingValidation.ts';
import AiRatingController from '../controller/AiRatingController.ts';

export default class AiRatingRoute {
  static register(router: Router): void {
    const auth = AsyncHandler.wrap(requireAuthenticatedUser);
    router.get('/submissions/:id/ai-rating', auth, requireRoles(1, 2), validateRequest(AiRatingValidation.id), AsyncHandler.wrap(AiRatingController.current));
    router.put('/submissions/:id/ai-rating', auth, requireRoles(1, 2), validateRequest(AiRatingValidation.save), AsyncHandler.wrap(AiRatingController.current));
    router.get('/admin/ai-ratings', auth, requireRoles(3), validateRequest(AiRatingValidation.list), AsyncHandler.wrap(AiRatingController.history));
  }
}
