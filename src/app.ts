import { protectVerifiedAudio } from './modules/community/middleware/VerifiedAudioMiddleware.ts';
import AsyncHandler from './utils/AsyncHandler.ts';
import FileStorageRoute from './modules/storage/route/FileStorageRoute.ts';
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
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'OK', timestamp: new Date().toISOString() });
  });
  app.use('/uploads', AsyncHandler.wrap(protectVerifiedAudio));
  new FileStorageRoute().register(app);
  // Cho phép frontend nhúng file (PDF bản nhạc) bằng iframe; các route API khác vẫn giữ header chống clickjacking của helmet.
  const frameAncestors = ["'self'", ...EnvConfig.corsOrigins.filter((origin) => origin !== '*')].join(' ');
  app.use('/uploads', (_request, response, next) => {
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.removeHeader('X-Frame-Options');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'none'; object-src 'self'; frame-ancestors ${frameAncestors}`
    );
    next();
  }, express.static(EnvConfig.fileStorageLocalRoot, { dotfiles: 'deny' }));
  app.use('/api', ApiRoute.createRouter());
  registerErrorHandlers(app);
  return app;
}
