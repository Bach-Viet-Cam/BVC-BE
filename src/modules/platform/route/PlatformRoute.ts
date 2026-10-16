import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import PlatformController from '../controller/PlatformController.ts';
import PlatformValidation from '../validation/PlatformValidation.ts';

export default class PlatformRoute {
  static register(router: Router): void {
    const instrumentRouter = express.Router();
    instrumentRouter.get(
      '/',
      validateRequest(PlatformValidation.listInstrumentsSchema),
      AsyncHandler.wrap(requireAuthenticatedUser),
      AsyncHandler.wrap(PlatformController.listInstruments)
    );
    router.use('/instruments', instrumentRouter);

    // TODO(M06): grading thresholds, System Admin only.
    const settingsRouter = express.Router();
    const adminOnly = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN)];
    settingsRouter.get('/grading', validateRequest(PlatformValidation.getGradingSchema), ...adminOnly, AsyncHandler.wrap(PlatformController.getGradingSettings));
    settingsRouter.put('/grading', validateRequest(PlatformValidation.updateGradingSchema), ...adminOnly, AsyncHandler.wrap(PlatformController.updateGradingSettings));
    router.use('/admin/settings', settingsRouter);
  }
}
