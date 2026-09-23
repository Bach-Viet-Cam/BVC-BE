import { createApp } from './app.ts';
import EnvConfig from './config/EnvConfig.ts';

export function startServer(): void {
  const app = createApp();
  app.listen(EnvConfig.port, () => {
    console.log(`Server is running on port ${EnvConfig.port}`);
  });
}

startServer();
