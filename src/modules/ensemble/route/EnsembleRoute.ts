import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { uploadRecording } from '../../../lib/UploadMiddleware.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import EnsembleController from '../controller/EnsembleController.ts';
import EnsembleValidation from '../validation/EnsembleValidation.ts';

export default class EnsembleRoute {
  static register(router: Router): void {
    const studentOnly = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.STUDENT)];
    router.get('/pieces/:pieceId/ensemble-tracks', ...studentOnly, validateRequest(EnsembleValidation.tracksSchema), AsyncHandler.wrap(EnsembleController.getTracks));
    const sessionRouter = express.Router();
    sessionRouter.post('/', ...studentOnly, AsyncHandler.wrap(uploadRecording()), validateRequest(EnsembleValidation.createSessionSchema), AsyncHandler.wrap(EnsembleController.createSession));
    sessionRouter.get('/:id', ...studentOnly, validateRequest(EnsembleValidation.sessionSchema), AsyncHandler.wrap(EnsembleController.getSession));
    router.use('/ensemble-sessions', sessionRouter);
  }
}
