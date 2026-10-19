import EnvConfig from '../../config/EnvConfig.ts';
import LocalStorageDriver from './LocalStorageDriver.ts';
import S3StorageDriver from './S3StorageDriver.ts';

export default class StorageService {
  static driverInstance: Backend.StorageDriver | null = null;

  static get driver(): Backend.StorageDriver {
    StorageService.driverInstance ??= EnvConfig.storageDriver === 's3' ? new S3StorageDriver() : new LocalStorageDriver();
    return StorageService.driverInstance;
  }

  static get localDriver(): LocalStorageDriver | null {
    return StorageService.driver instanceof LocalStorageDriver ? StorageService.driver : null;
  }

  // Best-effort delete used after a DB commit; an orphaned object must not fail the request
  static async deleteQuietly(storageKey: string): Promise<void> {
    try {
      await StorageService.driver.deleteObject(storageKey);
    } catch (error) {
      console.warn(`[storage] Could not delete object ${storageKey}`, error);
    }
  }
}
