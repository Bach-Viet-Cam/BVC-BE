import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import SystemConfigController from '../controller/SystemConfigController.ts';
import SystemConfigValidation from '../validation/SystemConfigValidation.ts';

export default class SystemConfigRoute {
  static register(router: Router): void {
    const configRouter = express.Router();
    configRouter.use(AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN));
    configRouter.get('/', validateRequest(SystemConfigValidation.listSchema), AsyncHandler.wrap(SystemConfigController.list));
    configRouter.patch('/:id', validateRequest(SystemConfigValidation.updateSchema), AsyncHandler.wrap(SystemConfigController.update));
    router.use('/system-configs', configRouter);
  }
}
