import type { NextFunction, Request, Response } from 'express';
import AppError from '../../../utils/AppError.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import AuthService from '../../auth/service/AuthService.ts';
import VerifiedContentService from '../../community/service/VerifiedContentService.ts';
import AudioAccessService from '../service/AudioAccessService.ts';
import SignedFileUrlService from '../service/SignedFileUrlService.ts';

const AUDIO_KEY = /^audio\/(\d{4}-\d{2}\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(wav|mp3|m4a)$/;

async function readOptionalUser(request: Request): Promise<Backend.UserDTO | null> {
  const [scheme, accessToken] = (request.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !accessToken) return null;
  try {
    const payload = AuthService.verifyAccessToken(accessToken) as { userId: string };
    return await AuthService.getAuthenticatedUser(payload.userId);
  } catch {
    throw AppError.unauthorized(AuthConstant.messages.JWT_INVALID);
  }
}

// Must precede BOTH static mounts of /uploads. Files outside audio/ (sheets, covers, videos) are not changed here.
// An audio file opens with a valid signed URL, when it is a public reference recording, or for a user allowed to hear
// it. A certified original never uses a raw URL.
export async function protectAudioFiles(request: Request, response: Response, next: NextFunction): Promise<void> {
  let pathname: string;
  try { pathname = decodeURIComponent(request.path).replace(/\\/g, '/'); }
  catch { return next(AppError.badRequest('Đường dẫn file không hợp lệ.')); }
  const segments = pathname.split('/').filter(Boolean);
  // Reject Windows alternate data streams, trailing characters and filesystem aliases before a static server sees them
  if (segments.some((part) => part === '.' || part === '..' || /[:\0]|[. ]$/.test(part))) return next(AppError.notFound());
  const key = segments.join('/').toLowerCase();
  if (!key.startsWith('audio/')) return next();
  response.setHeader('Cache-Control', 'private, no-store');
  if (!AUDIO_KEY.test(key)) return next(AppError.notFound());
  if (await VerifiedContentService.isProtectedKey(key)) return next(AppError.notFound('Vui lòng mở bản thu qua học liệu hoặc bài nộp.'));
  if (SignedFileUrlService.verify(key, request.query.exp, request.query.sig)) return next();
  const access = await AudioAccessService.check(key, await readOptionalUser(request));
  if (access === 'PUBLIC' || access === 'ALLOWED') return next();
  if (access === 'LOGIN_REQUIRED') return next(AppError.unauthorized(AuthConstant.messages.JWT_INVALID));
  return next(AppError.notFound());
}
