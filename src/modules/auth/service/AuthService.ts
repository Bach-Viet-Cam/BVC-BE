import crypto from 'node:crypto';
import { serialize } from 'cookie';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import type { Response } from 'express';
import EnvConfig from '../../../config/EnvConfig.ts';
import AppError from '../../../utils/AppError.ts';
import AuthConstant from '../constant/AuthConstant.ts';
import AuthDTO from '../dto/AuthDTO.ts';
import AuthRepository from '../repository/AuthRepository.ts';

const envConfig = EnvConfig;
const AUTH_MESSAGES = AuthConstant.messages;
const AUTH_PROVIDERS = AuthConstant.providers;
const REFRESH_TOKEN_COOKIE_NAME = AuthConstant.refreshTokenCookieName;
const authRepository = AuthRepository;
const toUserDTO = AuthDTO.toUserDTO;

export default class AuthService {
  static readonly googleClient = new OAuth2Client(EnvConfig.googleClientId);

  static getSafeRole(role: Backend.UserRole | undefined): Backend.UserRole {
    return role !== undefined && AuthConstant.selfRegisterableRoles.has(role)
      ? role
      : AuthConstant.roles.STUDENT;
  }

  static createAccessToken(user: Backend.UserRecord): string {
    return jwt.sign(
      { userId: user.id, role: user.role },
      EnvConfig.jwtSecret,
      { expiresIn: EnvConfig.jwtExpiresIn as SignOptions['expiresIn'] }
    );
  }

  static createRefreshToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static getRefreshExpiryDate(): Date {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + EnvConfig.refreshTokenExpiresInDays);
    return expiryDate;
  }

  static getRefreshCookieOptions() {
    return {
      httpOnly: true,
      secure: EnvConfig.nodeEnv === 'production',
      sameSite: 'lax' as const,
      path: '/api/auth',
      maxAge: EnvConfig.refreshTokenExpiresInDays * 24 * 60 * 60
    };
  }

  static setRefreshTokenCookie(response: Response, refreshToken: string): void {
    response.setHeader(
      'Set-Cookie',
      serialize(AuthConstant.refreshTokenCookieName, refreshToken, AuthService.getRefreshCookieOptions())
    );
  }

  static clearRefreshTokenCookie(response: Response): void {
    response.setHeader(
      'Set-Cookie',
      serialize(AuthConstant.refreshTokenCookieName, '', {
        ...AuthService.getRefreshCookieOptions(),
        maxAge: 0
      })
    );
  }
  static async verifyGoogleCredential(credential: string): Promise<Backend.GoogleProfile> {
  if (!envConfig.googleClientId) throw AppError.badRequest('Máy chủ chưa được cấu hình Google Client ID.');
  try {
    const ticket = await AuthService.googleClient.verifyIdToken({
      idToken: credential,
      audience: EnvConfig.googleClientId
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw AppError.unauthorized(AUTH_MESSAGES.GOOGLE_TOKEN_INVALID);
    }
    return {
      providerId: payload.sub,
      email: payload.email.toLowerCase(),
      username: payload.name || payload.email.split('@')[0]
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized(AUTH_MESSAGES.GOOGLE_TOKEN_INVALID);
  }
}
  static async findOrCreateUser(googleProfile: Backend.GoogleProfile, requestedRole?: Backend.UserRole): Promise<Backend.UserRecord> {
    const existingIdentity = await authRepository.findIdentityByProvider(
      AUTH_PROVIDERS.GOOGLE,
      googleProfile.providerId
    );

    if (existingIdentity) return existingIdentity.user;

    const existingUser = await authRepository.findUserByEmail(googleProfile.email);
    if (existingUser) {
      await authRepository.createIdentity({
        userId: existingUser.id,
        provider: AUTH_PROVIDERS.GOOGLE,
        providerId: googleProfile.providerId
      });
      return existingUser;
    }

    return authRepository.createUserWithIdentity({
      ...googleProfile,
      role: AuthService.getSafeRole(requestedRole),
      provider: AUTH_PROVIDERS.GOOGLE
    });
  }

  static async createSessionForUser(user: Backend.UserRecord): Promise<Backend.AuthTokens> {
    const refreshToken = AuthService.createRefreshToken();
    await authRepository.createSession({
      userId: user.id,
      refreshHash: AuthService.hashToken(refreshToken),
      expiresAt: AuthService.getRefreshExpiryDate()
    });

    return {
      refreshToken,
      accessToken: AuthService.createAccessToken(user)
    };
  }

  static async authenticateWithGoogle({ credential, role }: Backend.GoogleAuthRequest): Promise<Backend.AuthResult> {
    const googleProfile = await AuthService.verifyGoogleCredential(credential);
    const user = await AuthService.findOrCreateUser(googleProfile, role);
    const tokens = await AuthService.createSessionForUser(user);

    return { ...tokens, user: toUserDTO(user) };
  }

  static async refreshAccessToken(refreshToken: string | undefined): Promise<Backend.AuthResult> {
    if (!refreshToken) throw AppError.unauthorized(AUTH_MESSAGES.REFRESH_TOKEN_INVALID);

    const session = await authRepository.findActiveSessionByHash(AuthService.hashToken(refreshToken));
    if (!session) throw AppError.unauthorized(AUTH_MESSAGES.REFRESH_TOKEN_INVALID);

    const nextRefreshToken = AuthService.createRefreshToken();
    await authRepository.rotateSession({
      sessionId: session.id,
      refreshHash: AuthService.hashToken(nextRefreshToken),
      expiresAt: AuthService.getRefreshExpiryDate()
    });

    return {
      refreshToken: nextRefreshToken,
      accessToken: AuthService.createAccessToken(session.user),
      user: toUserDTO(session.user)
    };
  }
  static async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    const session = await authRepository.findActiveSessionByHash(AuthService.hashToken(refreshToken));
    if (session) await authRepository.revokeSession(session.id);
  }

  static verifyAccessToken(accessToken: string): string | JwtPayload {
    if (!accessToken || !envConfig.jwtSecret) {
      throw AppError.unauthorized(AUTH_MESSAGES.JWT_INVALID);
    }

    try {
      return jwt.verify(accessToken, envConfig.jwtSecret);
    } catch {
      throw AppError.unauthorized(AUTH_MESSAGES.JWT_INVALID);
    }
  }

  static async getAuthenticatedUser(userId: string): Promise<Backend.UserDTO> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw AppError.unauthorized(AUTH_MESSAGES.JWT_INVALID);
    return toUserDTO(user);
  }

  static getRefreshTokenCookieName(): string {
    return REFRESH_TOKEN_COOKIE_NAME;
  }

}
