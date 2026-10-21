import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import PlatformController from '../controller/PlatformController.ts';
import PlatformValidation from '../validation/PlatformValidation.ts';

export default class PlatformRoute {
  static register(router: Router): void {
    // Grading thresholds, System Admin only.
    const settingsRouter = express.Router();
    const adminOnly = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN)];
    settingsRouter.get('/grading', validateRequest(PlatformValidation.getGradingSchema), ...adminOnly, AsyncHandler.wrap(PlatformController.getGradingSettings));
    settingsRouter.put('/grading', validateRequest(PlatformValidation.updateGradingSchema), ...adminOnly, AsyncHandler.wrap(PlatformController.updateGradingSettings));
    router.use('/admin/settings', settingsRouter);
  }
}
