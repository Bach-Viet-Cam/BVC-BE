import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import ProgressController from '../controller/ProgressController.ts';
import ProgressValidation from '../validation/ProgressValidation.ts';

export default class ProgressRoute {
  static register(router: Router): void {
    const classRouter = express.Router();
    classRouter.use(AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.TEACHER));
    classRouter.get('/', validateRequest(ProgressValidation.classListSchema), AsyncHandler.wrap(ProgressController.listClasses));
    classRouter.get('/:classId/progress', validateRequest(ProgressValidation.progressSchema), AsyncHandler.wrap(ProgressController.getProgress));
    router.use('/classes', classRouter);
  }
}
