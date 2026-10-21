import RhythmPublisherService from './modules/audio/service/RhythmPublisherService.ts';
import { createApp } from './app.ts';
import EnvConfig from './config/EnvConfig.ts';
import NotificationDispatchService from './modules/platform/service/NotificationDispatchService.ts';

export function startServer(): void {
  const app = createApp();
  const server = app.listen(EnvConfig.port, () => {
    console.log(`Server is running on port ${EnvConfig.port}`);
    NotificationDispatchService.start();
  });
  const shutdown = (): void => {
    const deadline = setTimeout(() => { process.exit(1); }, 15_000);
    deadline.unref();
    server.close(() => { void RhythmPublisherService.instance.close().finally(() => { process.exit(0); }); });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer();
