import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import LocalFileStorageService from './LocalFileStorageService.ts';

test('Storage lưu vào root tùy chỉnh, tạo URL và xóa lặp an toàn', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-storage-test-'));
  try {
    const source = path.join(directory, 'source.wav');
    await writeFile(source, 'RIFF0000WAVE');
    const storage = new LocalFileStorageService(path.join(directory, 'custom'), 'https://storage.example.com/');
    const first = await storage.save({ sourcePath: source, originalName: '../../same.wav', contentType: 'audio/wav', namespace: 'audio' });
    const second = await storage.save({ sourcePath: source, originalName: '../../same.wav', contentType: 'audio/wav', namespace: 'audio' });
    assert.notEqual(first.key, second.key);
    assert.equal(await readFile(path.join(directory, 'custom', first.key), 'utf8'), 'RIFF0000WAVE');
    assert.equal(await storage.getDownloadUrl(first.key), `https://storage.example.com/uploads/${first.key}`);
    await assert.rejects(storage.getDownloadUrl('../source.wav'));
    await assert.rejects(storage.delete('../source.wav'));
    await storage.delete(first.key);
    await storage.delete(first.key);
    assert.equal((await stat(source)).size, 12);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
