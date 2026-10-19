import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, stat, unlink, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import FileStorageService from './FileStorageService.ts';
import FileStorageConstant from '../constant/FileStorageConstant.ts';

export default class LocalFileStorageService extends FileStorageService {
  readonly provider = 'local';
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(root: string, baseUrl: string) {
    super();
    this.root = path.resolve(root);
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('URL công khai của storage không hợp lệ.');
    }
    this.baseUrl = parsed.toString().replace(/\/$/, '');
  }

  private resolveKey(key: string): string {
    if (!/^audio\/[0-9a-f-]{36}\.(wav|mp3)$/.test(key)) throw new Error('Đường dẫn file không hợp lệ.');
    const target = path.resolve(this.root, key);
    const relative = path.relative(this.root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Đường dẫn file nằm ngoài storage.');
    return target;
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(path.join(this.root, FileStorageConstant.namespace), { recursive: true });
    if ((await lstat(path.join(this.root, FileStorageConstant.namespace))).isSymbolicLink()) {
      throw new Error('Thư mục audio không được là liên kết tượng trưng.');
    }
  }

  async save(input: { sourcePath: string; originalName: string; contentType: string; namespace: string }): Promise<{ key: string; sizeBytes: number; contentType: string }> {
    if (input.namespace !== FileStorageConstant.namespace) throw new Error('Thư mục lưu file không được hỗ trợ.');
    const extension = path.extname(input.originalName).toLowerCase();
    if (!['.wav', '.mp3'].includes(extension)) throw new Error('Định dạng file không được hỗ trợ.');
    await this.ensureDirectory();
    const key = `audio/${randomUUID()}${extension}`;
    const destination = this.resolveKey(key);
    try {
      await copyFile(input.sourcePath, destination, constants.COPYFILE_EXCL);
      return { key, sizeBytes: (await stat(destination)).size, contentType: input.contentType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        await this.delete(key).catch(() => console.error('Không thể dọn file lưu chưa hoàn tất.'));
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureDirectory();
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async getDownloadUrl(key: string): Promise<string> {
    this.resolveKey(key);
    return `${this.baseUrl}${FileStorageConstant.mountPath}/${path.posix.basename(key)}`;
  }
}
