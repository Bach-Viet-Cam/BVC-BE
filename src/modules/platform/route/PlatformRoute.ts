import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import PlatformController from '../controller/PlatformController.ts';
import PlatformValidation from '../validation/PlatformValidation.ts';

export default class PlatformRoute {
  static register(router: Router): void {
    const instrumentRouter = express.Router();
    instrumentRouter.get(
      '/',
      validateRequest(PlatformValidation.listInstrumentsSchema),
      AsyncHandler.wrap(requireAuthenticatedUser),
      AsyncHandler.wrap(PlatformController.listInstruments)
    );
    router.use('/instruments', instrumentRouter);
  }
}
