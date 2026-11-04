import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import EnvConfig from '../../../config/EnvConfig.ts';
import AppError from '../../../utils/AppError.ts';

export default class VerifiedAudioService {
  static async legacy(fileUrl: string): Promise<{path: string; contentType: string}> {
    const base = new URL(EnvConfig.fileStoragePublicBaseUrl);
    let url: URL;
    try { url = new URL(fileUrl, base); } catch { throw AppError.notFound('Bản thu cũ không khả dụng.'); }
    if (url.origin !== base.origin || url.search || url.hash || url.username || url.password) throw AppError.notFound('Bản thu cũ không khả dụng.');
    const key = url.pathname.replace(/^\/uploads\//, '');
    return { path: await VerifiedAudioService.resolve(key, 'local'), contentType: key.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' };
  }
  static async resolve(key: string, provider: string): Promise<string> {
    if (provider !== 'local' || !/^audio\/[0-9a-f-]{36}\.(wav|mp3)$/.test(key)) throw AppError.notFound('Bản thu không khả dụng.');
    const root = await realpath(EnvConfig.fileStorageLocalRoot);
    const candidate = path.resolve(root, key);
    try {
      if ((await lstat(candidate)).isSymbolicLink()) throw AppError.notFound('Bản thu không khả dụng.');
      const resolved = await realpath(candidate);
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw AppError.notFound('Bản thu không khả dụng.');
      return resolved;
    } catch { throw AppError.notFound('File bản thu không còn tồn tại.'); }
  }
}
