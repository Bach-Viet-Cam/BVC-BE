import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireRoles } from '../../../middlewares/RoleMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { attachOptionalUser, requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import InstrumentController from '../controller/InstrumentController.ts';
import InstrumentValidation from '../validation/InstrumentValidation.ts';

export default class InstrumentRoute {
  static register(router: Router): void {
    const instrumentRouter = express.Router();
    const adminOnly = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.SYSTEM_ADMIN)];
    instrumentRouter.get('/', AsyncHandler.wrap(attachOptionalUser), validateRequest(InstrumentValidation.listSchema), AsyncHandler.wrap(InstrumentController.list));
    instrumentRouter.post('/', ...adminOnly, validateRequest(InstrumentValidation.createSchema), AsyncHandler.wrap(InstrumentController.create));
    instrumentRouter.patch('/:id', ...adminOnly, validateRequest(InstrumentValidation.updateSchema), AsyncHandler.wrap(InstrumentController.update));
    instrumentRouter.post('/:id/deactivate', ...adminOnly, validateRequest(InstrumentValidation.idSchema), AsyncHandler.wrap(InstrumentController.deactivate));
    instrumentRouter.post('/:id/activate', ...adminOnly, validateRequest(InstrumentValidation.idSchema), AsyncHandler.wrap(InstrumentController.activate));
    instrumentRouter.get('/:id/tunes', AsyncHandler.wrap(attachOptionalUser), validateRequest(InstrumentValidation.idSchema), AsyncHandler.wrap(InstrumentController.getTunes));
    instrumentRouter.put('/:id/tunes', ...adminOnly, validateRequest(InstrumentValidation.tunesSchema), AsyncHandler.wrap(InstrumentController.setTunes));
    router.use('/instruments', instrumentRouter);
  }
}
