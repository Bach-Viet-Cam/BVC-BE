import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import VerifiedValidation from '../validation/VerifiedValidation.ts';
import VerifiedController from '../controller/VerifiedController.ts';

export default class VerifiedRoute {
  static register(router: Router): void {
    const auth = AsyncHandler.wrap(requireAuthenticatedUser);
    const manage = requireRoles(2, 3);
    router.get('/submissions/:id/review', auth, validateRequest(VerifiedValidation.id), AsyncHandler.wrap(VerifiedController.review));
    router.post('/submissions/:id/review', auth, requireRoles(2), validateRequest(VerifiedValidation.review), AsyncHandler.wrap(VerifiedController.review));
    router.put('/submissions/:id/sharing-consent', auth, requireRoles(1), validateRequest(VerifiedValidation.consent), AsyncHandler.wrap(VerifiedController.consent));
    router.get('/submissions/:id/audio', auth, validateRequest(VerifiedValidation.id), AsyncHandler.wrap(VerifiedController.audio));
    router.get('/verified-contents', auth, manage, validateRequest(VerifiedValidation.list), AsyncHandler.wrap(VerifiedController.list));
    router.get('/verified-contents/:id', auth, manage, validateRequest(VerifiedValidation.id), AsyncHandler.wrap(VerifiedController.detail));
    router.patch('/verified-contents/:id/visibility', auth, manage, validateRequest(VerifiedValidation.mutation), AsyncHandler.wrap(VerifiedController.mutate));
    router.post('/verified-contents/:id/revoke', auth, manage, validateRequest(VerifiedValidation.mutation), AsyncHandler.wrap(VerifiedController.mutate));
    router.get('/verified-contents/:id/audio', auth, manage, validateRequest(VerifiedValidation.id), AsyncHandler.wrap(VerifiedController.audio));
    router.get('/library/pieces/:id/verified-recordings', auth, validateRequest(VerifiedValidation.library), AsyncHandler.wrap(VerifiedController.list));
    router.get('/library/verified-recordings/:id/audio', auth, validateRequest(VerifiedValidation.id), AsyncHandler.wrap(VerifiedController.audio));
  }
}
