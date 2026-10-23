import AudioRoute from '../modules/audio/route/AudioRoute.ts';
import express from 'express';
import type { Router } from 'express';
import AuthRoute from '../modules/auth/route/AuthRoute.ts';
import MusicLibraryRoute from '../modules/music-library/route/MusicLibraryRoute.ts';
import UserRoute from '../modules/platform/route/UserRoute.ts';
import InstrumentRoute from '../modules/platform/route/InstrumentRoute.ts';
import SystemConfigRoute from '../modules/platform/route/SystemConfigRoute.ts';
import AdminStatsRoute from '../modules/platform/route/AdminStatsRoute.ts';
import ContentCategoryRoute from '../modules/platform/route/ContentCategoryRoute.ts';
import NotificationRoute from '../modules/platform/route/NotificationRoute.ts';
import MyNotificationRoute from '../modules/platform/route/MyNotificationRoute.ts';
import ProgressRoute from '../modules/classes/route/ProgressRoute.ts';
import AssignmentRoute from '../modules/classes/route/AssignmentRoute.ts';
import ClassRoute from '../modules/classes/route/ClassRoute.ts';
import LecturerAssignmentRoute from '../modules/assignments/route/AssignmentRoute.ts';
import PlatformRoute from '../modules/platform/route/PlatformRoute.ts';
import StudentProgressRoute from '../modules/progress/route/ProgressRoute.ts';
import RoadmapRoute from '../modules/roadmaps/route/RoadmapRoute.ts';
import EnsembleRoute from '../modules/ensemble/route/EnsembleRoute.ts';
import LeaderboardRoute from '../modules/leaderboard/route/LeaderboardRoute.ts';
import ChallengeRoute from '../modules/challenges/route/ChallengeRoute.ts';

export default class ApiRoute {
  static createRouter(): Router {
    const apiRouter: Router = express.Router();
    const v1Router: Router = express.Router();
    AuthRoute.register(v1Router);
    MusicLibraryRoute.register(v1Router);
    UserRoute.register(v1Router);
    InstrumentRoute.register(v1Router);
    SystemConfigRoute.register(v1Router);
    AdminStatsRoute.register(v1Router);
    ContentCategoryRoute.register(v1Router);
    NotificationRoute.register(v1Router);
    MyNotificationRoute.register(v1Router);
    ProgressRoute.register(v1Router);
    AssignmentRoute.register(v1Router);
    ClassRoute.register(v1Router);
    LecturerAssignmentRoute.register(v1Router);
    // Registered after the classes ProgressRoute, which keeps serving GET /classes/:id/progress for the FE.
    StudentProgressRoute.register(v1Router);
    RoadmapRoute.register(v1Router);
    PlatformRoute.register(v1Router);
    EnsembleRoute.register(v1Router);
    LeaderboardRoute.register(v1Router);
    ChallengeRoute.register(v1Router);
    new AudioRoute().register(v1Router);
    apiRouter.use('/v1', v1Router);
    return apiRouter;
  }
}
