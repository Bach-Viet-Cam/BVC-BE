import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import CatalogCategoryController from '../controller/CatalogCategoryController.ts';
import CatalogCategoryValidation from '../validation/CatalogCategoryValidation.ts';

// Thể loại (GENRE) và trình độ (LEVEL) dùng cho bài hát và bản nhạc; chỉ quản trị viên quản lý
export default class CatalogCategoryRoute {
  static register(router: Router): void {
    const categoryRouter = express.Router();
    const adminOnly = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN)];
    categoryRouter.get('/', ...adminOnly, validateRequest(CatalogCategoryValidation.listSchema), AsyncHandler.wrap(CatalogCategoryController.list));
    categoryRouter.post('/', ...adminOnly, validateRequest(CatalogCategoryValidation.createSchema), AsyncHandler.wrap(CatalogCategoryController.create));
    categoryRouter.patch('/:id', ...adminOnly, validateRequest(CatalogCategoryValidation.updateSchema), AsyncHandler.wrap(CatalogCategoryController.update));
    categoryRouter.post('/:id/deactivate', ...adminOnly, validateRequest(CatalogCategoryValidation.idSchema), AsyncHandler.wrap(CatalogCategoryController.deactivate));
    categoryRouter.post('/:id/activate', ...adminOnly, validateRequest(CatalogCategoryValidation.idSchema), AsyncHandler.wrap(CatalogCategoryController.activate));
    categoryRouter.delete('/:id', ...adminOnly, validateRequest(CatalogCategoryValidation.idSchema), AsyncHandler.wrap(CatalogCategoryController.remove));
    router.use('/categories', categoryRouter);
  }
}
