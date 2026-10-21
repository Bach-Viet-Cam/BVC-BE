import EnvConfig from '../../../config/EnvConfig.ts';
import FileStorageService from './FileStorageService.ts';
import LocalFileStorageService from './LocalFileStorageService.ts';

export default class FileStorageFactoryService {
  create(): FileStorageService {
    if (EnvConfig.fileStorageProvider !== 'local') throw new Error('Nhà cung cấp storage chưa được hỗ trợ.');
    if (!EnvConfig.fileStorageLocalRoot.trim()) throw new Error('Thư mục lưu file local không được để trống.');
    return new LocalFileStorageService(EnvConfig.fileStorageLocalRoot, EnvConfig.fileStoragePublicBaseUrl);
  }
}
