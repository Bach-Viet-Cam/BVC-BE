import type { RequestHandler, Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import StudentStatsController from '../controller/StudentStatsController.ts';
import StudentStatsValidation from '../validation/StudentStatsValidation.ts';

const lecturerOnly: RequestHandler[] = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.TEACHER)];
const studentOnly: RequestHandler[] = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.STUDENT)];

// Student stats: lecturer view of one class member, student view of themself, lecturer overall evaluation.
export default class StudentStatsRoute {
  static register(router: Router): void {
    const wrap = AsyncHandler.wrap;
    router.get(
      '/classes/:id/students/:studentId/stats',
      validateRequest(StudentStatsValidation.lecturerStatsSchema),
      ...lecturerOnly,
      wrap(StudentStatsController.getForLecturer)
    );
    router.put(
      '/classes/:id/students/:studentId/evaluation',
      validateRequest(StudentStatsValidation.evaluationSchema),
      ...lecturerOnly,
      wrap(StudentStatsController.saveEvaluation)
    );
    router.get('/me/stats', ...studentOnly, validateRequest(StudentStatsValidation.myStatsSchema), wrap(StudentStatsController.getMine));
  }
}
