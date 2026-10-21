import LocalStorageDriver from './LocalStorageDriver.ts';

export default class StorageService {
  static driverInstance: LocalStorageDriver | null = null;

  static get driver(): LocalStorageDriver {
    StorageService.driverInstance ??= new LocalStorageDriver();
    return StorageService.driverInstance;
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
