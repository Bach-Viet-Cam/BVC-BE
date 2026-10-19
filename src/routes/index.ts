import AudioRoute from '../modules/audio/route/AudioRoute.ts';
import express from 'express';
import type { Router } from 'express';
import AuthRoute from '../modules/auth/route/AuthRoute.ts';
import MusicLibraryRoute from '../modules/music-library/route/MusicLibraryRoute.ts';
import LocalStorageRoute from './LocalStorageRoute.ts';
import UserRoute from '../modules/platform/route/UserRoute.ts';
import InstrumentRoute from '../modules/platform/route/InstrumentRoute.ts';
import SystemConfigRoute from '../modules/platform/route/SystemConfigRoute.ts';
import AdminStatsRoute from '../modules/platform/route/AdminStatsRoute.ts';
import ContentCategoryRoute from '../modules/platform/route/ContentCategoryRoute.ts';
import NotificationRoute from '../modules/platform/route/NotificationRoute.ts';
import ProgressRoute from '../modules/classes/route/ProgressRoute.ts';
import AssignmentRoute from '../modules/classes/route/AssignmentRoute.ts';
import EnsembleRoute from '../modules/ensemble/route/EnsembleRoute.ts';

export default class ApiRoute {
  static createRouter(): Router {
    const apiRouter: Router = express.Router();
    const v1Router: Router = express.Router();
    AuthRoute.register(v1Router);
    MusicLibraryRoute.register(v1Router);
    LocalStorageRoute.register(v1Router);
    UserRoute.register(v1Router);
    InstrumentRoute.register(v1Router);
    SystemConfigRoute.register(v1Router);
    AdminStatsRoute.register(v1Router);
    ContentCategoryRoute.register(v1Router);
    NotificationRoute.register(v1Router);
    ProgressRoute.register(v1Router);
    AssignmentRoute.register(v1Router);
    EnsembleRoute.register(v1Router);
    new AudioRoute().register(v1Router);
    apiRouter.use('/v1', v1Router);
    return apiRouter;
  }
}
