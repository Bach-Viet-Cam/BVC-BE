import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import EnvConfig from '../../config/EnvConfig.ts';

// S3-compatible storage (AWS S3 or MinIO). Files are uploaded by the browser through presigned PUT URLs.
export default class S3StorageDriver implements Backend.StorageDriver {
  readonly client: S3Client;
  readonly bucket: string;

  constructor() {
    this.bucket = EnvConfig.s3Bucket;
    this.client = new S3Client({
      region: EnvConfig.s3Region,
      endpoint: EnvConfig.s3Endpoint || undefined,
      forcePathStyle: EnvConfig.s3ForcePathStyle,
      credentials: EnvConfig.s3AccessKeyId
        ? { accessKeyId: EnvConfig.s3AccessKeyId, secretAccessKey: EnvConfig.s3SecretAccessKey }
        : undefined
    });
  }

  async createUploadUrl(storageKey: string, mimeType: string, expiresInSec: number): Promise<Backend.PresignedUpload> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, ContentType: mimeType });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSec });
    return {
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString()
    };
  }

  async createReadUrl(storageKey: string, expiresInSec: number): Promise<string> {
    // Sign with a time-bucketed date so the URL stays stable for half of its lifetime (cache friendly)
    const windowMs = Math.max(60_000, Math.floor((expiresInSec * 1000) / 2));
    const signingDate = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSec, signingDate });
  }

  async statObject(storageKey: string): Promise<Backend.StoredObjectInfo | null> {
    try {
      const headResult = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return { sizeBytes: Number(headResult.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }

  async readRange(storageKey: string, byteCount: number): Promise<Buffer> {
    const getResult = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Range: `bytes=0-${byteCount - 1}`
    }));
    return Buffer.from(await getResult.Body!.transformToByteArray());
  }

  async readObject(storageKey: string): Promise<Buffer> {
    const getResult = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    return Buffer.from(await getResult.Body!.transformToByteArray());
  }

  async openReadStream(storageKey: string): Promise<NodeJS.ReadableStream> {
    const getResult = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    return getResult.Body as NodeJS.ReadableStream;
  }

  async putObject(storageKey: string, content: Buffer, mimeType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: content, ContentType: mimeType }));
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}
