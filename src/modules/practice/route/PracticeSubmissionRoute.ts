import crypto from 'node:crypto';
import type { NextFunction, Request, Response, Router } from 'express';
import EnvConfig from '../../../config/EnvConfig.ts';
import AppError from '../../../utils/AppError.ts';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import PracticeResultController from '../controller/PracticeResultController.ts';
import PracticeSettingsController from '../controller/PracticeSettingsController.ts';
import PracticeSubmissionController from '../controller/PracticeSubmissionController.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import PracticeContextService from '../service/PracticeContextService.ts';
import PracticeFileService from '../service/PracticeFileService.ts';
import PracticeResultService from '../service/PracticeResultService.ts';
import PracticeSettingsService from '../service/PracticeSettingsService.ts';
import PracticeSubmissionService from '../service/PracticeSubmissionService.ts';
import SubmissionHistoryService from '../service/SubmissionHistoryService.ts';
import SubmissionProgressService from '../service/SubmissionProgressService.ts';
import PracticeValidation from '../validation/PracticeValidation.ts';

// Rhythm service calls back with a shared secret header; compared in constant time
function requireCallbackSecret(request: Request, _response: Response, next: NextFunction): void {
  const givenSecret = Buffer.from(String(request.headers['x-callback-secret'] || ''));
  const expectedSecret = Buffer.from(EnvConfig.aiCallbackSecret);
  const isValid = expectedSecret.length > 0
    && givenSecret.length === expectedSecret.length
    && crypto.timingSafeEqual(givenSecret, expectedSecret);
  if (!isValid) return next(AppError.unauthorized('Callback secret không hợp lệ.'));
  return next();
}

export default class PracticeSubmissionRoute {
  register(router: Router): void {
    const repository = new PracticeSubmissionRepository();
    const progress = new SubmissionProgressService(repository, new PracticeFileService(repository));
    const controller = new PracticeSubmissionController(
      new PracticeSubmissionService({ repository, progress }), progress, new PracticeContextService(repository), new SubmissionHistoryService(repository)
    );
    const results = new PracticeResultController(new PracticeResultService());
    const settings = new PracticeSettingsController(new PracticeSettingsService(repository));
    const student = requireRoles(AuthConstant.roles.STUDENT);
    const validation = new PracticeValidation();
    const wrap = AsyncHandler.wrap;
    const auth = wrap(requireAuthenticatedUser);

    // Registered before '/:id' routes; only students practice, so lecturers and admins get 403
    router.get('/practice/context', validateRequest(validation.contextSchema), auth, requireRoles(AuthConstant.roles.STUDENT), wrap(controller.getContext));
    // Record screen: tempo to practise at (assignment BPM or the default) and the instrument's string tunings
    router.get('/practice/target-bpm', validateRequest(validation.contextSchema), auth, student, wrap(settings.getTargetBpm));
    router.get('/practice/sheets/:sheetMusicId/tunes', validateRequest(validation.sheetParamsSchema), auth, student, wrap(settings.getTunes));
    router.post('/practice/submissions', validateRequest(validation.createSchema), auth, wrap(controller.create));
    // SCR-01 history; registered before '/:id' so "piece-options" is not read as a submission id
    router.get('/practice/submissions', validateRequest(validation.historySchema), auth, student, wrap(controller.listHistory));
    router.get('/practice/submissions/piece-options', validateRequest(validation.emptySchema), auth, student, wrap(controller.listHistoryPieces));
    // Registered before '/:id' so "active" is not read as a submission id
    router.get('/practice/submissions/active', validateRequest(validation.activeSchema), auth, wrap(controller.getActive));
    router.get('/practice/submissions/:id', validateRequest(validation.idSchema), auth, wrap(controller.get));
    router.post('/practice/submissions/:id/retry', validateRequest(validation.idSchema), auth, wrap(controller.retry));
    // M01 results screen: one endpoint per card, all scoped to the student's own submission
    router.get('/practice/submissions/:id/result', validateRequest(validation.idSchema), auth, wrap(results.getResult));
    router.get('/practice/submissions/:id/history', validateRequest(validation.idSchema), auth, wrap(results.getHistory));
    router.get('/practice/submissions/:id/class-rank', validateRequest(validation.idSchema), auth, wrap(results.getClassRank));
    router.get('/practice/submissions/:id/pitch-chart', validateRequest(validation.idSchema), auth, wrap(results.getPitchChart));
    // Rhythm service → backend, authenticated by the shared callback secret
    router.post('/internal/practice-submissions/progress', validateRequest(validation.callbackSchema), requireCallbackSecret, wrap(controller.receiveProgress));
  }
}
