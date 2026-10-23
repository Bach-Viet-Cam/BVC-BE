import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import { requireCallbackSecret } from '../../music-library/middleware/InternalCallbackMiddleware.ts';
import PracticeSubmissionController from '../controller/PracticeSubmissionController.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import PracticeFileService from '../service/PracticeFileService.ts';
import PracticeSubmissionService from '../service/PracticeSubmissionService.ts';
import SubmissionProgressService from '../service/SubmissionProgressService.ts';
import PracticeValidation from '../validation/PracticeValidation.ts';

export default class PracticeSubmissionRoute {
  register(router: Router): void {
    const repository = new PracticeSubmissionRepository();
    const progress = new SubmissionProgressService(repository, new PracticeFileService(repository));
    const controller = new PracticeSubmissionController(new PracticeSubmissionService({ repository, progress }), progress);
    const validation = new PracticeValidation();
    const wrap = AsyncHandler.wrap;
    const auth = wrap(requireAuthenticatedUser);

    router.post('/practice/submissions', validateRequest(validation.createSchema), auth, wrap(controller.create));
    // Registered before '/:id' so "active" is not read as a submission id
    router.get('/practice/submissions/active', validateRequest(validation.activeSchema), auth, wrap(controller.getActive));
    router.get('/practice/submissions/:id', validateRequest(validation.idSchema), auth, wrap(controller.get));
    router.post('/practice/submissions/:id/retry', validateRequest(validation.idSchema), auth, wrap(controller.retry));
    // Rhythm service → backend, authenticated by the shared callback secret
    router.post('/internal/practice-submissions/progress', validateRequest(validation.callbackSchema), requireCallbackSecret, wrap(controller.receiveProgress));
  }
}
