import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import NotificationController from '../controller/NotificationController.ts';
import NotificationValidation from '../validation/NotificationValidation.ts';

export default class NotificationRoute {
  static register(router: Router): void {
    const notificationRouter = express.Router();
    notificationRouter.use(AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN));
    notificationRouter.get('/', validateRequest(NotificationValidation.listSchema), AsyncHandler.wrap(NotificationController.list));
    notificationRouter.post('/', validateRequest(NotificationValidation.createSchema), AsyncHandler.wrap(NotificationController.create));
    notificationRouter.patch('/:id', validateRequest(NotificationValidation.updateSchema), AsyncHandler.wrap(NotificationController.update));
    notificationRouter.post('/:id/send', validateRequest(NotificationValidation.idSchema), AsyncHandler.wrap(NotificationController.send));
    notificationRouter.delete('/:id', validateRequest(NotificationValidation.idSchema), AsyncHandler.wrap(NotificationController.remove));
    router.use('/admin/notifications', notificationRouter);
  }
}
