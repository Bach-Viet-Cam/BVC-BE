import RhythmPublisherService from './modules/audio/service/RhythmPublisherService.ts';
import TemplateAnalysisPublisherService from './modules/music-library/service/TemplateAnalysisPublisherService.ts';
import AnalysisService from './modules/music-library/service/AnalysisService.ts';
import { createApp } from './app.ts';
import EnvConfig from './config/EnvConfig.ts';
import NotificationDispatchService from './modules/platform/service/NotificationDispatchService.ts';
import LeaderboardScheduler from './modules/leaderboard/service/LeaderboardScheduler.ts';

export function startServer(): void {
  const app = createApp();
  const server = app.listen(EnvConfig.port, () => {
    console.log(`Server is running on port ${EnvConfig.port}`);
    NotificationDispatchService.start();
    LeaderboardScheduler.start();
    AnalysisService.start();
  });
  const shutdown = (): void => {
    LeaderboardScheduler.stop();
    AnalysisService.stop();
    const deadline = setTimeout(() => { process.exit(1); }, 15_000);
    deadline.unref();
    server.close(() => { void Promise.all([RhythmPublisherService.instance.close(), TemplateAnalysisPublisherService.instance.close()]).finally(() => { process.exit(0); }); });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer();
