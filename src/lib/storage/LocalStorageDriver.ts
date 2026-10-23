import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import EnvConfig from '../../config/EnvConfig.ts';

// Stores objects under FILE_STORAGE_LOCAL_ROOT; app.ts serves that folder statically at /uploads.
// Read URLs are plain public URLs: anyone holding the URL can download the file.
export default class LocalStorageDriver implements Backend.StorageDriver {
  static readonly publicPath = '/uploads';

  readonly rootDir: string;

  constructor(rootDir: string = EnvConfig.fileStorageLocalRoot) {
    this.rootDir = path.resolve(rootDir);
  }

  resolvePath(storageKey: string): string {
    const filePath = path.resolve(this.rootDir, storageKey);
    if (!filePath.startsWith(this.rootDir + path.sep)) throw new Error('Invalid storage key.');
    return filePath;
  }

  createReadUrl(storageKey: string): string {
    const encodedKey = storageKey.split('/').map(encodeURIComponent).join('/');
    return `${EnvConfig.fileStoragePublicBaseUrl}${LocalStorageDriver.publicPath}/${encodedKey}`;
  }

  async statObject(storageKey: string): Promise<Backend.StoredObjectInfo | null> {
    try {
      const fileStat = await fsPromises.stat(this.resolvePath(storageKey));
      return { sizeBytes: fileStat.size };
    } catch {
      return null;
    }
  }

  async readRange(storageKey: string, byteCount: number): Promise<Buffer> {
    const fileHandle = await fsPromises.open(this.resolvePath(storageKey), 'r');
    try {
      const buffer = Buffer.alloc(byteCount);
      const { bytesRead } = await fileHandle.read(buffer, 0, byteCount, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fileHandle.close();
    }
  }

  async readObject(storageKey: string): Promise<Buffer> {
    return fsPromises.readFile(this.resolvePath(storageKey));
  }

  async openReadStream(storageKey: string): Promise<NodeJS.ReadableStream> {
    return fs.createReadStream(this.resolvePath(storageKey));
  }

  async putObject(storageKey: string, content: Buffer): Promise<void> {
    const filePath = this.resolvePath(storageKey);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, content);
  }

  async writeStream(storageKey: string, source: NodeJS.ReadableStream, maxBytes: number): Promise<number> {
    const filePath = this.resolvePath(storageKey);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    return new Promise<number>((resolve, reject) => {
      let writtenBytes = 0;
      const fileStream = fs.createWriteStream(filePath);
      source.on('data', (chunk: Buffer) => {
        writtenBytes += chunk.length;
        if (writtenBytes > maxBytes) {
          source.removeAllListeners('data');
          fileStream.destroy();
          fsPromises.rm(filePath, { force: true }).finally(() => reject(new Error('Upload too large.')));
        }
      });
      source.on('error', reject);
      fileStream.on('error', reject);
      fileStream.on('finish', () => resolve(writtenBytes));
      source.pipe(fileStream);
    });
  }

  async deleteObject(storageKey: string): Promise<void> {
    await fsPromises.rm(this.resolvePath(storageKey), { force: true });
  }
}
