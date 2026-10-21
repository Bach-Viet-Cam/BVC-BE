import path from 'node:path';
import 'dotenv/config';

const parsedPort = Number(process.env.PORT);
const parsedRefreshTokenExpiresInDays = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS);

export default class EnvConfig {
  // Local file storage shared by every module; files are served statically under /uploads
  static readonly fileStorageProvider = (process.env.FILE_STORAGE_PROVIDER ?? 'local').trim().toLowerCase();
  static readonly fileStorageLocalRoot = process.env.FILE_STORAGE_LOCAL_ROOT === undefined ? path.resolve('uploads')
    : process.env.FILE_STORAGE_LOCAL_ROOT.trim() ? path.resolve(process.env.FILE_STORAGE_LOCAL_ROOT.trim()) : '';
  // Origin of this API (no /uploads suffix), used to build absolute file and upload URLs
  static readonly fileStoragePublicBaseUrl = (process.env.FILE_STORAGE_PUBLIC_BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).trim().replace(/\/$/, '');
  static readonly rabbitmqUrl = process.env.RABBITMQ_URL?.trim() || '';
  static readonly rhythmServiceBaseUrl = (process.env.RHYTHM_SERVICE_BASE_URL || 'http://localhost:8001').trim().replace(/\/$/, '');
  static readonly rhythmServiceInternalApiKey = process.env.RHYTHM_SERVICE_INTERNAL_API_KEY?.trim() || '';

  static readonly port: number = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  static readonly appOrigin: string = process.env.APP_ORIGIN || '*';
  static readonly corsOrigins: string[] = (process.env.CORS_ORIGINS || EnvConfig.appOrigin)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  static readonly databaseUrl: string = process.env.DATABASE_URL || '';
  static readonly nodeEnv: string = process.env.NODE_ENV || 'development';
  static readonly googleClientId: string = process.env.GOOGLE_CLIENT_ID || '';
  static readonly jwtSecret: string = process.env.JWT_SECRET || '';
  static readonly jwtExpiresIn: string = process.env.JWT_EXPIRES_IN || '15m';
  static readonly refreshTokenExpiresInDays: number = Number.isInteger(parsedRefreshTokenExpiresInDays) && parsedRefreshTokenExpiresInDays > 0
    ? parsedRefreshTokenExpiresInDays
    : 7;
}
