import { createApp } from './app.ts';
import EnvConfig from './config/EnvConfig.ts';
import MusicLibraryModule from './modules/music-library/index.ts';

export function startServer(): void {
  const app = createApp();
  MusicLibraryModule.initialize();
  app.listen(EnvConfig.port, () => {
    console.log(`Server is running on port ${EnvConfig.port}`);
  });
}

startServer();
