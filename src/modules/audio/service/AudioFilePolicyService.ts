import path from 'node:path';
import { open } from 'node:fs/promises';
import { parseFile } from 'music-metadata';
import AppError from '../../../utils/AppError.ts';
import CatalogService from '../../music-library/service/CatalogService.ts';
import MediaInspectionService from '../../music-library/service/MediaInspectionService.ts';

interface AudioFilePolicyDependencies {
  getFileRules?: () => Promise<MusicLibrary.FileRules>;
  readDurationSec?: (filePath: string) => Promise<number>;
  assertDuration?: (durationSec: number) => Promise<void>;
}

const MIME_TYPES: Readonly<Record<string, { contentType: string; accepted: readonly string[] }>> = Object.freeze({
  wav: { contentType: 'audio/wav', accepted: ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'] },
  mp3: { contentType: 'audio/mpeg', accepted: ['audio/mpeg', 'audio/mp3', 'audio/x-mp3'] },
  m4a: { contentType: 'audio/mp4', accepted: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'] }
});

// GBR-10: the formats, size and duration of a recording follow System Configuration (group "Giới hạn file"),
// the same rules as the library uploads, so the messages are MSG-13, MSG-14 and MSG-15.
export default class AudioFilePolicyService {
  private readonly getFileRules: () => Promise<MusicLibrary.FileRules>;
  private readonly readDurationSec: (filePath: string) => Promise<number>;
  private readonly assertDuration: (durationSec: number) => Promise<void>;

  constructor(dependencies: AudioFilePolicyDependencies = {}) {
    this.getFileRules = dependencies.getFileRules ?? (() => CatalogService.getFileRules('AUDIO'));
    this.readDurationSec = dependencies.readDurationSec ?? AudioFilePolicyService.readDuration;
    this.assertDuration = dependencies.assertDuration ?? MediaInspectionService.assertAudioDuration;
  }

  async validate(file: Express.Multer.File | undefined): Promise<string> {
    if (!file) throw AppError.badRequest('Vui lòng chọn một file audio.');
    const rules = await this.getFileRules();
    if (!file.size) throw AppError.badRequest(`File phải có dữ liệu và không vượt quá ${rules.maxMb} MB.`);
    if (file.size > rules.maxBytes) throw AppError.withMessage(400, 'MSG-14', { max_size: rules.maxMb }, 'file');
    const contentType = await AudioFilePolicyService.detectContentType(file, rules);
    if (!contentType) throw MediaInspectionService.unsupportedFormat(rules);
    let durationSec: number;
    try {
      durationSec = await this.readDurationSec(file.path);
    } catch {
      throw MediaInspectionService.unsupportedFormat(rules);
    }
    await this.assertDuration(durationSec);
    return contentType;
  }

  // The extension must be allowed, its content (magic bytes) must match it, and so must the declared MIME type
  private static async detectContentType(file: Express.Multer.File, rules: MusicLibrary.FileRules): Promise<string | null> {
    const extension = path.extname(file.originalname).slice(1).toLowerCase();
    const mime = MIME_TYPES[extension];
    if (!mime || !rules.extensions.includes(extension) || !mime.accepted.includes(file.mimetype)) return null;
    const handle = await open(file.path, 'r');
    const header = Buffer.alloc(12);
    let bytesRead: number;
    try { ({ bytesRead } = await handle.read(header, 0, 12, 0)); } finally { await handle.close(); }
    return AudioFilePolicyService.matchesContent(extension, header, bytesRead) ? mime.contentType : null;
  }

  private static matchesContent(extension: string, header: Buffer, bytesRead: number): boolean {
    if (extension === 'wav') return bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE';
    if (extension === 'm4a') return bytesRead >= 8 && header.toString('ascii', 4, 8) === 'ftyp';
    return bytesRead >= 3 && (header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 255 && (header[1] & 0xe0) === 0xe0
      && (header[1] & 0x06) !== 0 && (header[1] & 0x18) !== 0x08 && (header[2] & 0xf0) !== 0xf0 && (header[2] & 0xf0) !== 0));
  }

  // Duration of the file as uploaded, before the silent edges are trimmed; rounded like the library uploads
  static async readDuration(filePath: string): Promise<number> {
    const metadata = await parseFile(filePath, { duration: true });
    const durationSec = metadata.format.duration;
    if (!durationSec || !Number.isFinite(durationSec)) throw new Error('Missing duration');
    return Math.round(durationSec);
  }
}
