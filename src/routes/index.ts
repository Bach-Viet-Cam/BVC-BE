import express from 'express';
import type { Router } from 'express';
import AuthRoute from '../modules/auth/route/AuthRoute.ts';
import MusicLibraryRoute from '../modules/music-library/route/MusicLibraryRoute.ts';
import LocalStorageRoute from './LocalStorageRoute.ts';

export default class ApiRoute {
  static createRouter(): Router {
    const apiRouter: Router = express.Router();
    const v1Router: Router = express.Router();
    AuthRoute.register(v1Router);
    MusicLibraryRoute.register(v1Router);
    LocalStorageRoute.register(v1Router);
    apiRouter.use('/v1', v1Router);
    return apiRouter;
  }
}
