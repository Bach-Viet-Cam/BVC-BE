import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import StorageUsageService from './StorageUsageService.ts';

describe('StorageUsageService.measureDirectory', () => {
  it('cộng dồn kích thước và đếm tệp, kể cả thư mục con', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bvc-usage-'));
    try {
      await writeFile(path.join(root, 'a.wav'), Buffer.alloc(5));
      await mkdir(path.join(root, 'sub'));
      await writeFile(path.join(root, 'sub', 'b.wav'), Buffer.alloc(7));
      assert.deepEqual(await StorageUsageService.measureDirectory(root), { usedBytes: 12, fileCount: 2 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('thư mục không tồn tại trả 0, không ném lỗi (Review Focus 2)', async () => {
    const missing = path.join(tmpdir(), 'bvc-usage-khong-ton-tai-' + Date.now());
    assert.deepEqual(await StorageUsageService.measureDirectory(missing), { usedBytes: 0, fileCount: 0 });
  });
});
