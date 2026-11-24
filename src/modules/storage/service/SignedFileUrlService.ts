import crypto from 'node:crypto';
import EnvConfig from '../../../config/EnvConfig.ts';

// Audio files under /uploads/audio are private. The BE hands out URLs signed with an expiry to callers it has already
// authorised (API responses) and to the Rhythm service (jobs), so they can be played or downloaded without a token.
export default class SignedFileUrlService {
  static readonly ttlMs = 24 * 60 * 60 * 1000;
  static readonly publicPath = '/uploads/';

  // Adds exp and sig to an absolute or relative /uploads/audio/... URL; any other URL is returned unchanged
  static sign(url: string, now: number = Date.now()): string {
    const parsed = new URL(url, EnvConfig.fileStoragePublicBaseUrl);
    const key = SignedFileUrlService.keyOf(parsed.pathname);
    if (!key || !key.startsWith('audio/')) return url;
    const expiresAt = Math.floor((now + SignedFileUrlService.ttlMs) / 1000);
    parsed.searchParams.set('exp', String(expiresAt));
    parsed.searchParams.set('sig', SignedFileUrlService.signature(key, expiresAt));
    return parsed.toString();
  }

  static verify(key: string, expiresAt: unknown, signature: unknown, now: number = Date.now()): boolean {
    if (typeof expiresAt !== 'string' || typeof signature !== 'string' || !/^\d{1,12}$/.test(expiresAt)) return false;
    if (Number(expiresAt) * 1000 < now || !EnvConfig.fileUrlSigningSecret) return false;
    const expected = Buffer.from(SignedFileUrlService.signature(key.toLowerCase(), Number(expiresAt)));
    const given = Buffer.from(signature);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  // Storage key of an /uploads/... path, lower-cased like the access check compares it
  static keyOf(pathname: string): string | null {
    if (!pathname.startsWith(SignedFileUrlService.publicPath)) return null;
    try {
      return decodeURIComponent(pathname.slice(SignedFileUrlService.publicPath.length)).toLowerCase();
    } catch {
      return null;
    }
  }

  private static signature(key: string, expiresAt: number): string {
    return crypto.createHmac('sha256', EnvConfig.fileUrlSigningSecret).update(`${key}:${expiresAt}`).digest('base64url');
  }
}
