import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import type { RequestHandler } from 'express';
import AppError from '../../../utils/AppError.ts';
import AudioConstant from '../constant/AudioConstant.ts';

export function uploadAudio(): RequestHandler {
  return async (request, response, next): Promise<void> => {
    const directory = path.join(os.tmpdir(), AudioConstant.temporaryDirectory);
    await mkdir(directory, { recursive: true });
    const cleanup = (): void => {
      if (request.file?.path) void unlink(request.file.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') console.error('Không thể dọn file audio tạm.');
      });
    };
    response.once('finish', cleanup);
    response.once('close', cleanup);
    multer({
      storage: multer.diskStorage({ destination: directory, filename: (_request, _file, callback) => callback(null, randomUUID()) }),
      limits: { fileSize: AudioConstant.maxFileBytes, files: 1, fields: 0, parts: 1 }
    }).single('file')(request, response, (error: unknown) => {
      if (error) return next(AppError.badRequest(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'File audio không được vượt quá 25 MiB.' : 'Không thể tải file lên. Vui lòng gửi đúng một file audio.'));
      return next();
    });
  };
}
