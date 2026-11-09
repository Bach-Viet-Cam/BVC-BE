import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import FaqValidation from '../validation/FaqValidation.ts';
import FaqController from '../controller/FaqController.ts';

export default class FaqRoute {
  static register(router: Router): void {
    const auth = AsyncHandler.wrap(requireAuthenticatedUser);
    const admin = requireRoles(AuthConstant.roles.SYSTEM_ADMIN);
    router.get('/faqs', validateRequest(FaqValidation.list), AsyncHandler.wrap(FaqController.list));
    router.get('/admin/faqs', auth, admin, validateRequest(FaqValidation.list), AsyncHandler.wrap(FaqController.list));
    router.post('/admin/faqs', auth, admin, validateRequest(FaqValidation.create), AsyncHandler.wrap(FaqController.save));
    router.patch('/admin/faqs/:id', auth, admin, validateRequest(FaqValidation.update), AsyncHandler.wrap(FaqController.save));
    router.delete('/admin/faqs/:id', auth, admin, validateRequest(FaqValidation.id), AsyncHandler.wrap(FaqController.remove));
  }
}
