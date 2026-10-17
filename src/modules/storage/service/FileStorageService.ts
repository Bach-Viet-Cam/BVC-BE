export default abstract class FileStorageService {
  abstract readonly provider: string;
  abstract save(input: { sourcePath: string; originalName: string; contentType: string; namespace: string }): Promise<{ key: string; sizeBytes: number; contentType: string }>;
  abstract delete(key: string): Promise<void>;
  abstract getDownloadUrl(key: string): Promise<string>;
}
