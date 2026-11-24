import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import LlmKeyValidation from '../validation/LlmKeyValidation.ts';
import LlmKeyController from '../controller/LlmKeyController.ts';

export default class LlmKeyRoute {
  static register(router: Router): void {
    const auth = AsyncHandler.wrap(requireAuthenticatedUser);
    const admin = requireRoles(AuthConstant.roles.SYSTEM_ADMIN);
    router.get('/admin/llm-keys', auth, admin, validateRequest(LlmKeyValidation.listRequest), AsyncHandler.wrap(LlmKeyController.list));
    router.post('/admin/llm-keys', auth, admin, validateRequest(LlmKeyValidation.create), AsyncHandler.wrap(LlmKeyController.create));
    router.patch('/admin/llm-keys/:id', auth, admin, validateRequest(LlmKeyValidation.update), AsyncHandler.wrap(LlmKeyController.update));
    router.delete('/admin/llm-keys/:id', auth, admin, validateRequest(LlmKeyValidation.id), AsyncHandler.wrap(LlmKeyController.remove));
  }
}
