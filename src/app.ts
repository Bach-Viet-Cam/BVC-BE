import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import EnvConfig from './config/EnvConfig.ts';
import ApiRoute from './routes/index.ts';
import { registerErrorHandlers } from './middlewares/ErrorMiddleware.ts';

export function createApp(): Express {
  const app = express();
  app.use(helmet());
  const corsOptions: CorsOptions = {
    credentials: true,
    origin: (requestOrigin, callback) => {
      if (!requestOrigin || EnvConfig.corsOrigins.includes('*') || EnvConfig.corsOrigins.includes(requestOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS.'));
    }
  };
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'OK', timestamp: new Date().toISOString() });
  });
  app.use('/api', ApiRoute.createRouter());
  registerErrorHandlers(app);
  return app;
}
