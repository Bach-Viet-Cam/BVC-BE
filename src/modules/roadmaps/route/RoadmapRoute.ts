import express from 'express';
import type { RequestHandler, Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import RoadmapController from '../controller/RoadmapController.ts';
import RoadmapValidation from '../validation/RoadmapValidation.ts';

const adminOnly: RequestHandler[] = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN)];

// UC-11 roadmap management (System Admin) and the read-only class roadmap (lecturer owner / student member).
export default class RoadmapRoute {
  static register(router: Router): void {
    const adminRouter = express.Router();
    const wrap = AsyncHandler.wrap;

    adminRouter.get('/', validateRequest(RoadmapValidation.listSchema), ...adminOnly, wrap(RoadmapController.listInstruments));
    adminRouter.get('/:instrumentId', validateRequest(RoadmapValidation.instrumentSchema), ...adminOnly, wrap(RoadmapController.getEditableRoadmap));
    adminRouter.get('/:instrumentId/exercises', validateRequest(RoadmapValidation.exercisesSchema), ...adminOnly, wrap(RoadmapController.listFingerExercises));
    adminRouter.post('/:instrumentId/versions', validateRequest(RoadmapValidation.saveVersionSchema), ...adminOnly, wrap(RoadmapController.saveVersion));

    router.use('/admin/roadmaps', adminRouter);

    const classRoadmapRouter = express.Router();
    classRoadmapRouter.get(
      '/:id/roadmap',
      validateRequest(RoadmapValidation.classRoadmapSchema),
      AsyncHandler.wrap(requireAuthenticatedUser),
      requireRoles(AuthConstant.roles.TEACHER, AuthConstant.roles.STUDENT),
      wrap(RoadmapController.getClassRoadmap)
    );
    router.use('/classes', classRoadmapRouter);
  }
}
