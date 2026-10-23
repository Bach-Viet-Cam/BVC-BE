import express from 'express';
import type { RequestHandler, Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import ChallengeController from '../controller/ChallengeController.ts';
import ChallengeValidation from '../validation/ChallengeValidation.ts';

const lecturerOnly: RequestHandler[] = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.TEACHER)];

// Weekly challenges managed by lecturers (UC-18). Authentication and role run before validation.
export default class ChallengeRoute {
  static register(router: Router): void {
    const challengeRouter = express.Router();
    const wrap = AsyncHandler.wrap;

    challengeRouter.use(...lecturerOnly);
    challengeRouter.get('/', validateRequest(ChallengeValidation.listSchema), wrap(ChallengeController.listChallenges));
    // Static paths are registered before '/:id' so they are not read as a challenge id.
    challengeRouter.get('/form-meta', validateRequest(ChallengeValidation.emptySchema), wrap(ChallengeController.getFormMeta));
    challengeRouter.get('/pieces', validateRequest(ChallengeValidation.piecesSchema), wrap(ChallengeController.listPieces));
    challengeRouter.get('/:id', validateRequest(ChallengeValidation.idSchema), wrap(ChallengeController.getChallenge));
    challengeRouter.post('/', validateRequest(ChallengeValidation.createSchema), wrap(ChallengeController.createChallenge));
    challengeRouter.patch('/:id', validateRequest(ChallengeValidation.updateSchema), wrap(ChallengeController.updateChallenge));
    challengeRouter.delete('/:id', validateRequest(ChallengeValidation.idSchema), wrap(ChallengeController.deleteChallenge));
    challengeRouter.post('/:id/publish', validateRequest(ChallengeValidation.idSchema), wrap(ChallengeController.publishChallenge));

    router.use('/lecturer/challenges', challengeRouter);
  }
}
