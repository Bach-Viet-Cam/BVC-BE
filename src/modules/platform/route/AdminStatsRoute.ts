import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import AdminStatsController from '../controller/AdminStatsController.ts';

export default class AdminStatsRoute {
  static register(router: Router): void {
    const statsRouter = express.Router();
    const adminOnly = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN)];
    statsRouter.get('/overview', ...adminOnly, AsyncHandler.wrap(AdminStatsController.overview));
    statsRouter.get('/monitoring', ...adminOnly, AsyncHandler.wrap(AdminStatsController.monitoring));
    router.use('/admin', statsRouter);
  }
}
