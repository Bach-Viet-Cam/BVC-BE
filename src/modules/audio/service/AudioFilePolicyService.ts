import path from 'node:path';
import { open } from 'node:fs/promises';
import AppError from '../../../utils/AppError.ts';
import AudioConstant from '../constant/AudioConstant.ts';

export default class AudioFilePolicyService {
  async validate(file: Express.Multer.File | undefined): Promise<string> {
    if (!file) throw AppError.badRequest('Vui lòng chọn một file audio.');
    if (!file.size || file.size > AudioConstant.maxFileBytes) throw AppError.badRequest('File phải có dữ liệu và không vượt quá 25 MiB.');
    const extension = path.extname(file.originalname).toLowerCase();
    const handle = await open(file.path, 'r');
    const header = Buffer.alloc(12);
    let bytesRead: number;
    try { ({ bytesRead } = await handle.read(header, 0, 12, 0)); } finally { await handle.close(); }
    const wav = bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE';
    const mp3 = bytesRead >= 3 && (header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 255 && (header[1] & 0xe0) === 0xe0 && (header[1] & 0x06) !== 0 && (header[1] & 0x18) !== 0x08 && (header[2] & 0xf0) !== 0xf0 && (header[2] & 0xf0) !== 0));
    if (extension === '.wav' && wav && ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'].includes(file.mimetype)) return 'audio/wav';
    if (extension === '.mp3' && mp3 && ['audio/mpeg', 'audio/mp3', 'audio/x-mp3'].includes(file.mimetype)) return 'audio/mpeg';
    throw AppError.badRequest('File phải là WAV hoặc MP3 với nội dung và định dạng audio phù hợp.');
  }
}
