import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import UserController from '../controller/UserController.ts';
import UserValidation from '../validation/UserValidation.ts';

export default class UserRoute {
  static register(router: Router): void {
    const userRouter = express.Router();
    userRouter.use(AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN));
    userRouter.get('/', validateRequest(UserValidation.listSchema), AsyncHandler.wrap(UserController.list));
    userRouter.post('/', validateRequest(UserValidation.createSchema), AsyncHandler.wrap(UserController.create));
    userRouter.patch('/:id', validateRequest(UserValidation.updateSchema), AsyncHandler.wrap(UserController.update));
    userRouter.post('/:id/lock', validateRequest(UserValidation.idSchema), AsyncHandler.wrap(UserController.lock));
    userRouter.post('/:id/unlock', validateRequest(UserValidation.idSchema), AsyncHandler.wrap(UserController.unlock));
    router.use('/users', userRouter);
  }
}
