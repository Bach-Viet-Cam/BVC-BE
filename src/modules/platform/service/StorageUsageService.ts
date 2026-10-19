import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export default class StorageUsageService {
  static async measureDirectory(directory: string): Promise<Backend.DirectoryUsage> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { usedBytes: 0, fileCount: 0 };
      throw error;
    }
    let usedBytes = 0;
    let fileCount = 0;
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = await StorageUsageService.measureDirectory(entryPath);
        usedBytes += nested.usedBytes;
        fileCount += nested.fileCount;
      } else if (entry.isFile()) {
        usedBytes += (await stat(entryPath)).size;
        fileCount += 1;
      }
    }
    return { usedBytes, fileCount };
  }

  static async measureUploads(): Promise<Backend.DirectoryUsage> {
    return StorageUsageService.measureDirectory(path.resolve('uploads'));
  }
}
