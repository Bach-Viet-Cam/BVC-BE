import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import EnvConfig from '../../config/EnvConfig.ts';

interface LocalUrlClaims { key: string; method: 'GET' | 'PUT'; expiresAt: number; mimeType?: string; }

// Stores objects on local disk and serves them through signed URLs handled by LocalStorageRoute.
// Meant for development and tests; production should use the S3 driver.
export default class LocalStorageDriver implements Backend.StorageDriver {
  static readonly routePrefix = '/api/v1/storage/local';
  static readonly contentTypes: Readonly<Record<string, string>> = Object.freeze({
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.json': 'application/json'
  });

  readonly rootDir: string;

  constructor(rootDir: string = EnvConfig.storageLocalDir) {
    this.rootDir = path.resolve(rootDir);
  }

  resolvePath(storageKey: string): string {
    const filePath = path.resolve(this.rootDir, storageKey);
    if (!filePath.startsWith(this.rootDir + path.sep)) throw new Error('Invalid storage key.');
    return filePath;
  }

  static sign(encodedClaims: string): string {
    return crypto.createHmac('sha256', EnvConfig.storageSigningSecret).update(encodedClaims).digest('base64url');
  }

  static createToken(claims: LocalUrlClaims): string {
    const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${encodedClaims}.${LocalStorageDriver.sign(encodedClaims)}`;
  }

  static verifyToken(token: string, method: 'GET' | 'PUT'): LocalUrlClaims | null {
    const [encodedClaims, signature] = token.split('.');
    if (!encodedClaims || !signature) return null;
    const expectedSignature = Buffer.from(LocalStorageDriver.sign(encodedClaims));
    const givenSignature = Buffer.from(signature);
    if (expectedSignature.length !== givenSignature.length) return null;
    if (!crypto.timingSafeEqual(expectedSignature, givenSignature)) return null;
    const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as LocalUrlClaims;
    if (claims.method !== method || claims.expiresAt < Date.now()) return null;
    return claims;
  }

  static getContentType(storageKey: string): string {
    return LocalStorageDriver.contentTypes[path.extname(storageKey).toLowerCase()] || 'application/octet-stream';
  }

  // Read URLs are bucketed by time window so the same file keeps the same URL for a while (cache friendly)
  static getBucketedExpiry(expiresInSec: number): number {
    const windowMs = Math.max(60_000, Math.floor((expiresInSec * 1000) / 2));
    return Math.floor(Date.now() / windowMs) * windowMs + expiresInSec * 1000;
  }

  async createUploadUrl(storageKey: string, mimeType: string, expiresInSec: number): Promise<Backend.PresignedUpload> {
    const expiresAt = Date.now() + expiresInSec * 1000;
    const token = LocalStorageDriver.createToken({ key: storageKey, method: 'PUT', expiresAt, mimeType });
    return {
      uploadUrl: `${EnvConfig.publicApiUrl}${LocalStorageDriver.routePrefix}/${token}`,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  async createReadUrl(storageKey: string, expiresInSec: number): Promise<string> {
    const expiresAt = LocalStorageDriver.getBucketedExpiry(expiresInSec);
    const token = LocalStorageDriver.createToken({ key: storageKey, method: 'GET', expiresAt });
    return `${EnvConfig.publicApiUrl}${LocalStorageDriver.routePrefix}/${token}`;
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

  async putObject(storageKey: string, content: Buffer, _mimeType: string): Promise<void> {
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
