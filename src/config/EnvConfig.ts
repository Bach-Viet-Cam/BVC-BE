import path from 'node:path';
import 'dotenv/config';

const parsedPort = Number(process.env.PORT);
const parsedRefreshTokenExpiresInDays = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS);

function readPositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsedValue = Number(rawValue);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

export default class EnvConfig {
  static readonly fileStorageProvider = (process.env.FILE_STORAGE_PROVIDER ?? 'local').trim().toLowerCase();
  static readonly fileStorageLocalRoot = process.env.FILE_STORAGE_LOCAL_ROOT === undefined ? path.resolve('uploads')
    : process.env.FILE_STORAGE_LOCAL_ROOT.trim() ? path.resolve(process.env.FILE_STORAGE_LOCAL_ROOT.trim()) : '';
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
  static readonly redisUrl: string = process.env.REDIS_URL || '';
  // Public base URL of this API, used to build local-storage signed URLs and AI callback URLs
  static readonly publicApiUrl: string = (process.env.PUBLIC_API_URL || `http://localhost:${EnvConfig.port}`).replace(/\/$/, '');

  // Object storage: "local" (files on disk, served by this API) or "s3" (S3 / MinIO)
  static readonly storageDriver: string = process.env.STORAGE_DRIVER || 'local';
  static readonly storageLocalDir: string = process.env.STORAGE_LOCAL_DIR || './storage';
  static readonly storageSigningSecret: string = process.env.STORAGE_SIGNING_SECRET || EnvConfig.jwtSecret;
  static readonly s3Endpoint: string = process.env.S3_ENDPOINT || '';
  static readonly s3Region: string = process.env.S3_REGION || 'us-east-1';
  static readonly s3Bucket: string = process.env.S3_BUCKET || '';
  static readonly s3AccessKeyId: string = process.env.S3_ACCESS_KEY_ID || '';
  static readonly s3SecretAccessKey: string = process.env.S3_SECRET_ACCESS_KEY || '';
  static readonly s3ForcePathStyle: boolean = process.env.S3_FORCE_PATH_STYLE !== 'false';

  // AI audio-analysis service (JOB-01 / JOB-02)
  static readonly aiServiceUrl: string = (process.env.AI_SERVICE_URL || '').replace(/\/$/, '');
  static readonly aiCallbackSecret: string = process.env.AI_CALLBACK_SECRET || '';
  static readonly aiRetryDelayMs: number = readPositiveInteger(process.env.AI_RETRY_DELAY_MS, 30_000);
  static readonly mockAiService: boolean = process.env.MOCK_AI_SERVICE === 'true' && EnvConfig.nodeEnv !== 'production';
  static readonly mockAiDelayMs: number = readPositiveInteger(process.env.MOCK_AI_DELAY_MS, 3_000);
}
