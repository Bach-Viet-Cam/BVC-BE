import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import StorageUsageService from './StorageUsageService.ts';

test('UTC-SUS-001 - sums file sizes including subdirectories', async () => {
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

test('UTC-SUS-002 - missing directory returns zero usage', async () => {
  const missing = path.join(tmpdir(), 'bvc-usage-khong-ton-tai-' + Date.now());

  // R1: tưởng ném ENOENT
  assert.deepEqual(await StorageUsageService.measureDirectory(missing), { usedBytes: 0, fileCount: 0 });
});

test('UTC-SUS-003 - symlink entries are ignored', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bvc-usage-symlink-'));
  try {
    await writeFile(path.join(root, 'a.wav'), Buffer.alloc(5));
    await symlink(path.join(root, 'a.wav'), path.join(root, 'lien-ket'), 'junction');

    assert.deepEqual(await StorageUsageService.measureDirectory(root), { usedBytes: 5, fileCount: 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('UTC-SUS-004 - measureUploads delegates to resolved uploads path', async (t) => {
  const measureMock = t.mock.method(StorageUsageService, 'measureDirectory', async () => ({
    usedBytes: 0, fileCount: 0
  }));

  await StorageUsageService.measureUploads();

  assert.equal(measureMock.mock.calls[0].arguments[0], path.resolve('uploads'));
});
