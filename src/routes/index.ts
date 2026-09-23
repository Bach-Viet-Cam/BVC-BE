import express from 'express';
import type { Router } from 'express';
import AuthRoute from '../modules/auth/route/AuthRoute.ts';

export default class ApiRoute {
  static createRouter(): Router {
    const apiRouter: Router = express.Router();
    const v1Router: Router = express.Router();
    AuthRoute.register(v1Router);
    apiRouter.use('/v1', v1Router);
    return apiRouter;
  }
}
