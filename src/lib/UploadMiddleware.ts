import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import AppError from '../utils/AppError.ts';
import EnsembleConstant from '../modules/ensemble/constant/EnsembleConstant.ts';
import SystemConfigService from '../modules/platform/service/SystemConfigService.ts';

export function uploadRecording(): RequestHandler {
  return async function uploadRecordingMiddleware(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const maxMb = await SystemConfigService.getNumber('max_recording_mb');
      const storage = multer.diskStorage({
        destination: (_request, _file, callback) => {
          fs.mkdirSync(path.resolve(EnsembleConstant.recordingDir), { recursive: true });
          callback(null, path.resolve(EnsembleConstant.recordingDir));
        },
        filename: (httpRequest, file, callback) => {
          const userId = (httpRequest as Request).auth?.user.userId ?? 'anonymous';
          callback(null, `${userId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`);
        }
      });
      response.on('finish', () => {
        if (response.statusCode >= 400 && request.file?.path) fs.promises.unlink(request.file.path).catch(() => undefined);
      });
      multer({ storage, limits: { fileSize: maxMb * 1024 * 1024 } }).single(EnsembleConstant.recordingFieldName)(request, response, (error: unknown) => {
        if (error instanceof multer.MulterError) {
          const message = error.code === 'LIMIT_FILE_SIZE' ? `Bản thu vượt quá dung lượng tối đa ${maxMb} MB.` : EnsembleConstant.messages.UPLOAD_FAILED;
          return next(AppError.badRequest(message));
        }
        return next(error);
      });
    } catch (error) {
      next(error);
    }
  };
}
