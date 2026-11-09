import type { NextFunction, Request, Response } from 'express';
import VerifiedContentService from '../service/VerifiedContentService.ts';
import AppError from '../../../utils/AppError.ts';

// This guard must precede BOTH static mounts. Certified originals never use a public raw URL.
export async function protectVerifiedAudio(request: Request, response: Response, next: NextFunction): Promise<void> {
  let pathname: string;
  try { pathname = decodeURIComponent(request.path).replace(/\\/g, '/'); }
  catch { return next(AppError.badRequest('Đường dẫn file không hợp lệ.')); }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((part) => part === '.' || part === '..' || /[:\0]|[. ]$/.test(part))) return next(AppError.notFound());
  const relative = segments.join('/').toLowerCase();
  if (relative.toLowerCase().startsWith('audio/')) {
    response.setHeader('Cache-Control', 'private, no-store');
    // Reject Windows alternate data streams, trailing characters and filesystem aliases
    // before either static server sees the path. Compare only canonical storage keys.
    if (!/^audio\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(wav|mp3)$/.test(relative)) return next(AppError.notFound());
    if (await VerifiedContentService.isProtectedKey(relative)) return next(AppError.notFound('Vui lòng mở bản thu qua học liệu hoặc bài nộp.'));
  }
  next();
}
