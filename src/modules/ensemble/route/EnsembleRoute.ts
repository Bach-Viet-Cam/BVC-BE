import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
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
  }
}
