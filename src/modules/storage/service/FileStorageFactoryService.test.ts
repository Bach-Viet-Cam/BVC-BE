import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import EnvConfig from '../../../config/EnvConfig.ts';
import FileStorageFactoryService from './FileStorageFactoryService.ts';
import LocalFileStorageService from './LocalFileStorageService.ts';

const BASE_URL = 'http://localhost:3000';

function stubEnv(provider: string, root: string, baseUrl: string): () => void {
  const originalProvider = EnvConfig.fileStorageProvider;
  const originalRoot = EnvConfig.fileStorageLocalRoot;
  const originalBaseUrl = EnvConfig.fileStoragePublicBaseUrl;
  Object.defineProperty(EnvConfig, 'fileStorageProvider', { value: provider, configurable: true, writable: true });
  Object.defineProperty(EnvConfig, 'fileStorageLocalRoot', { value: root, configurable: true, writable: true });
  Object.defineProperty(EnvConfig, 'fileStoragePublicBaseUrl', { value: baseUrl, configurable: true, writable: true });
  return () => {
    Object.defineProperty(EnvConfig, 'fileStorageProvider', { value: originalProvider, configurable: true, writable: true });
    Object.defineProperty(EnvConfig, 'fileStorageLocalRoot', { value: originalRoot, configurable: true, writable: true });
    Object.defineProperty(EnvConfig, 'fileStoragePublicBaseUrl', { value: originalBaseUrl, configurable: true, writable: true });
  };
}

test('UTC-FSF-001 - unsupported provider throws', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bvc-ut-'));
  const restore = stubEnv('s3', dir, BASE_URL);
  try {
    assert.throws(() => new FileStorageFactoryService().create(), {
      message: 'Nhà cung cấp storage chưa được hỗ trợ.'
    });
  } finally {
    restore();
    await rm(dir, { recursive: true, force: true });
  }
});

test('UTC-FSF-002 - local provider creates LocalFileStorageService', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bvc-ut-'));
  const restore = stubEnv('local', dir, BASE_URL);
  try {
    const storage = new FileStorageFactoryService().create();
    assert.ok(storage instanceof LocalFileStorageService);
    assert.equal(storage.provider, 'local');
  } finally {
    restore();
    await rm(dir, { recursive: true, force: true });
  }
});

test('UTC-FSF-003 - uppercase provider is normalized to local', () => {
  // EnvConfig chỉ đọc FILE_STORAGE_PROVIDER lúc import, nên phải tải lại module trong process mới
  const script = [
    "import EnvConfig from './src/config/EnvConfig.ts';",
    "import FileStorageFactoryService from './src/modules/storage/service/FileStorageFactoryService.ts';",
    "console.log(EnvConfig.fileStorageProvider, new FileStorageFactoryService().create().constructor.name);"
  ].join(' ');
  const output = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FILE_STORAGE_PROVIDER: 'LOCAL',
      FILE_STORAGE_LOCAL_ROOT: process.cwd(),
      FILE_STORAGE_PUBLIC_BASE_URL: BASE_URL
    },
    encoding: 'utf-8'
  }).trim();

  // R1: tưởng chữ hoa bị từ chối
  assert.equal(output, 'local LocalFileStorageService');
});

test('UTC-FSF-004 - empty local root throws', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bvc-ut-'));
  const restore = stubEnv('local', '', BASE_URL);
  try {
    assert.throws(() => new FileStorageFactoryService().create(), {
      message: 'Thư mục lưu file local không được để trống.'
    });
  } finally {
    restore();
    await rm(dir, { recursive: true, force: true });
  }
});

test('UTC-FSF-005 - whitespace local root throws', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bvc-ut-'));
  const restore = stubEnv('local', '   ', BASE_URL);
  try {
    assert.throws(() => new FileStorageFactoryService().create(), {
      message: 'Thư mục lưu file local không được để trống.'
    });
  } finally {
    restore();
    await rm(dir, { recursive: true, force: true });
  }
});

test('UTC-FSF-006 - invalid public URL throws', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bvc-ut-'));
  const restore = stubEnv('local', dir, 'ftp://localhost/');
  try {
    assert.throws(() => new FileStorageFactoryService().create(), {
      message: 'URL công khai của storage không hợp lệ.'
    });
  } finally {
    restore();
    await rm(dir, { recursive: true, force: true });
  }
});
