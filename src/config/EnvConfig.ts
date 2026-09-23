import 'dotenv/config';

const parsedPort = Number(process.env.PORT);
const parsedRefreshTokenExpiresInDays = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS);

export default class EnvConfig {
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
