import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthController from '../controller/AuthController.ts';
import { requireAuthenticatedUser } from '../middleware/AuthMiddleware.ts';
import AuthValidation from '../validation/AuthValidation.ts';

export default class AuthRoute {
  static register(router: Router): void {
    const authRouter = express.Router();
    authRouter.post('/google', validateRequest(AuthValidation.googleAuthSchema), AsyncHandler.wrap(AuthController.googleAuth));
    authRouter.post('/refresh', validateRequest(AuthValidation.refreshSchema), AsyncHandler.wrap(AuthController.refresh));
    authRouter.post('/logout', validateRequest(AuthValidation.logoutSchema), AsyncHandler.wrap(AuthController.logout));
    authRouter.get('/me', AsyncHandler.wrap(requireAuthenticatedUser), AsyncHandler.wrap(AuthController.getMe));
    router.use('/auth', authRouter);
  }
}
