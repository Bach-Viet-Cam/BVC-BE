import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import ProgressController from '../controller/ProgressController.ts';
import ProgressValidation from '../validation/ProgressValidation.ts';

const roles = AuthConstant.roles;

// UC-12: class progress (lecturer) and one student's summary / history (lecturer or the student themself).
export default class ProgressRoute {
  static register(router: Router): void {
    const progressRouter = express.Router();
    const wrap = AsyncHandler.wrap;
    const authenticated = wrap(requireAuthenticatedUser);

    progressRouter.get('/:id/progress', validateRequest(ProgressValidation.classSchema), authenticated, requireRoles(roles.TEACHER), wrap(ProgressController.getClassProgress));
    progressRouter.get(
      '/:id/students/:studentId/summary',
      validateRequest(ProgressValidation.summarySchema),
      authenticated,
      requireRoles(roles.TEACHER, roles.STUDENT),
      wrap(ProgressController.getStudentSummary)
    );
    progressRouter.get(
      '/:id/students/:studentId/history',
      validateRequest(ProgressValidation.historySchema),
      authenticated,
      requireRoles(roles.TEACHER, roles.STUDENT),
      wrap(ProgressController.getStudentHistory)
    );

    router.use('/classes', progressRouter);
  }
}
