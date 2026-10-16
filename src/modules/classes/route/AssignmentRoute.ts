import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import AssignmentController from '../controller/AssignmentController.ts';
import AssignmentValidation from '../validation/AssignmentValidation.ts';

export default class AssignmentRoute {
  static register(router: Router): void {
    const studentOnly = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.STUDENT)];
    router.get('/me/assignments', ...studentOnly, validateRequest(AssignmentValidation.listMineSchema), AsyncHandler.wrap(AssignmentController.listMine));
    const assignmentRouter = express.Router();
    assignmentRouter.get('/:id', ...studentOnly, validateRequest(AssignmentValidation.detailSchema), AsyncHandler.wrap(AssignmentController.getDetail));
    router.use('/assignments', assignmentRouter);
  }
}
