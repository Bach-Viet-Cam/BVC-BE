import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import ContentCategoryController from '../controller/ContentCategoryController.ts';
import ContentCategoryValidation from '../validation/ContentCategoryValidation.ts';

export default class ContentCategoryRoute {
  static register(router: Router): void {
    const categoryRouter = express.Router();
    const authenticated = AsyncHandler.wrap(requireAuthenticatedUser);
    const readers = [authenticated, requireRoles(AuthConstant.roles.TEACHER, AuthConstant.roles.SYSTEM_ADMIN)];
    const adminOnly = [authenticated, requireRoles(AuthConstant.roles.SYSTEM_ADMIN)];
    categoryRouter.get('/', ...readers, validateRequest(ContentCategoryValidation.emptySchema), AsyncHandler.wrap(ContentCategoryController.list));
    categoryRouter.post('/', ...adminOnly, validateRequest(ContentCategoryValidation.createSchema), AsyncHandler.wrap(ContentCategoryController.create));
    categoryRouter.patch('/:id', ...adminOnly, validateRequest(ContentCategoryValidation.updateSchema), AsyncHandler.wrap(ContentCategoryController.rename));
    categoryRouter.delete('/:id', ...adminOnly, validateRequest(ContentCategoryValidation.idSchema), AsyncHandler.wrap(ContentCategoryController.remove));
    router.use('/content-categories', categoryRouter);
  }
}
