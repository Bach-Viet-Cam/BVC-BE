import path from 'node:path';
import express from 'express';
import type { Express } from 'express';
import EnvConfig from '../../../config/EnvConfig.ts';
import FileStorageConstant from '../constant/FileStorageConstant.ts';
import FileStorageFactoryService from '../service/FileStorageFactoryService.ts';

export default class FileStorageRoute {
  register(app: Express): void {
    new FileStorageFactoryService().create();
    if (EnvConfig.fileStorageProvider !== 'local') return;
    app.use(FileStorageConstant.mountPath, express.static(path.join(EnvConfig.fileStorageLocalRoot, 'audio'), {
      fallthrough: false,
      dotfiles: 'deny',
      setHeaders: (response) => { response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); }
    }));
  }
}
