import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import LeaderboardController from '../controller/LeaderboardController.ts';
import LeaderboardValidation from '../validation/LeaderboardValidation.ts';

const roles = AuthConstant.roles;

// UC-17: leaderboard for every signed-in role; only the system admin may force a refresh.
export default class LeaderboardRoute {
  static register(router: Router): void {
    const leaderboardRouter = express.Router();
    const wrap = AsyncHandler.wrap;
    const authenticated = wrap(requireAuthenticatedUser);

    leaderboardRouter.get(
      '/current',
      validateRequest(LeaderboardValidation.currentSchema),
      authenticated,
      requireRoles(roles.STUDENT, roles.TEACHER, roles.SYSTEM_ADMIN),
      wrap(LeaderboardController.getCurrent)
    );
    leaderboardRouter.post('/refresh', validateRequest(LeaderboardValidation.refreshSchema), authenticated, requireRoles(roles.SYSTEM_ADMIN), wrap(LeaderboardController.refresh));
    router.use('/leaderboards', leaderboardRouter);
  }
}
