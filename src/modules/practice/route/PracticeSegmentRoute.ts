import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import PracticeSegmentController from '../controller/PracticeSegmentController.ts';
import { requireCallbackSecret } from '../middleware/CallbackSecretMiddleware.ts';
import PracticeSegmentRepository from '../repository/PracticeSegmentRepository.ts';
import PracticeSegmentService from '../service/PracticeSegmentService.ts';
import SegmentProgressService from '../service/SegmentProgressService.ts';
import PracticeValidation from '../validation/PracticeValidation.ts';

// UC-03: practise one range of a completed submission
export default class PracticeSegmentRoute {
  register(router: Router): void {
    const repository = new PracticeSegmentRepository();
    const progress = new SegmentProgressService(repository);
    const controller = new PracticeSegmentController(new PracticeSegmentService({ repository, progress }), progress);
    const student = requireRoles(AuthConstant.roles.STUDENT);
    const validation = new PracticeValidation();
    const wrap = AsyncHandler.wrap;
    const auth = wrap(requireAuthenticatedUser);

    router.post('/practice/submissions/:id/segments', validateRequest(validation.segmentCreateSchema), auth, student, wrap(controller.create));
    router.get('/practice/submissions/:id/segments', validateRequest(validation.segmentListSchema), auth, student, wrap(controller.list));
    router.get('/practice/segments/:segmentId', validateRequest(validation.segmentIdSchema), auth, student, wrap(controller.get));
    router.get('/practice/segments/:segmentId/pitch-chart', validateRequest(validation.segmentIdSchema), auth, student, wrap(controller.getPitchChart));
    // Rhythm service → backend, authenticated by the shared callback secret
    router.post('/internal/practice-segments/progress', validateRequest(validation.segmentCallbackSchema), requireCallbackSecret, wrap(controller.receiveProgress));
  }
}
