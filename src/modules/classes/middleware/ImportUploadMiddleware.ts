import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';

const importFile = ClassConstant.importFile;
const messages = ClassConstant.messages;

const uploadSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: importFile.MAX_BYTES, files: 1 }
}).single(importFile.FORM_FIELD);

// Server-side file checks for the student import (size here, format/rows in ImportFileParser).
export function receiveImportFile(request: Request, response: Response, next: NextFunction): void {
  uploadSingleFile(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(AppError.badRequest(messages.FILE_TOO_LARGE, { code: 'MSG-14' }));
      return next(AppError.badRequest(messages.FILE_REQUIRED, { code: 'MSG-35' }));
    }
    if (error) return next(error);
    if (!request.file) return next(AppError.badRequest(messages.FILE_REQUIRED, { code: 'MSG-35' }));
    // multer decodes multipart file names as latin1; restore UTF-8 Vietnamese names.
    request.file.originalname = Buffer.from(request.file.originalname, 'latin1').toString('utf8');
    return next();
  });
}
