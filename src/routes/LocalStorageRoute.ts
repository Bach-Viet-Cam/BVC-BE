import express from 'express';
import type { Request, Response, Router } from 'express';
import fs from 'node:fs';
import LocalStorageDriver from '../lib/storage/LocalStorageDriver.ts';
import StorageService from '../lib/storage/StorageService.ts';
import AppError from '../utils/AppError.ts';
import AsyncHandler from '../utils/AsyncHandler.ts';

// Emulates presigned PUT/GET URLs of an object store when STORAGE_DRIVER=local
export default class LocalStorageRoute {
  static readonly maxUploadBytes = 250 * 1024 * 1024;

  static register(router: Router): void {
    const localDriver = StorageService.localDriver;
    if (!localDriver) return;
    const storageRouter = express.Router();
    storageRouter.put('/:token', AsyncHandler.wrap((request, response) => LocalStorageRoute.uploadObject(localDriver, request, response)));
    storageRouter.get('/:token', AsyncHandler.wrap((request, response) => LocalStorageRoute.downloadObject(localDriver, request, response)));
    router.use('/storage/local', storageRouter);
  }

  static async uploadObject(localDriver: LocalStorageDriver, request: Request, response: Response): Promise<void> {
    const claims = LocalStorageDriver.verifyToken(String(request.params.token), 'PUT');
    if (!claims) throw AppError.forbidden('Đường dẫn tải lên không hợp lệ hoặc đã hết hạn.');
    try {
      await localDriver.writeStream(claims.key, request, LocalStorageRoute.maxUploadBytes);
    } catch {
      throw new AppError('File tải lên quá lớn.', 413);
    }
    response.status(200).end();
  }

  static async downloadObject(localDriver: LocalStorageDriver, request: Request, response: Response): Promise<void> {
    const claims = LocalStorageDriver.verifyToken(String(request.params.token), 'GET');
    if (!claims) throw AppError.forbidden('Đường dẫn tải xuống không hợp lệ hoặc đã hết hạn.');
    const objectInfo = await localDriver.statObject(claims.key);
    if (!objectInfo) throw new AppError('Không tìm thấy file.', 404);
    response.setHeader('Content-Type', LocalStorageDriver.getContentType(claims.key));
    response.setHeader('Content-Length', String(objectInfo.sizeBytes));
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(localDriver.resolvePath(claims.key)).pipe(response);
  }
}
