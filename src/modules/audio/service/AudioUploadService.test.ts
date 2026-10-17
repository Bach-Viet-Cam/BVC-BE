import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AudioUploadService from './AudioUploadService.ts';
import LocalFileStorageService from '../../storage/service/LocalFileStorageService.ts';
import type AudioRepository from '../repository/AudioRepository.ts';

test('Lỗi metadata dọn cả file đã lưu và file tạm', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-upload-test-'));
  try {
    const source = path.join(directory, 'source.wav'); await writeFile(source, 'RIFF0000WAVE');
    const storage = new LocalFileStorageService(path.join(directory, 'storage'), 'https://be.example.com');
    const repository = { createUpload: async () => { throw new Error('Lỗi DB giả lập.'); } } as unknown as AudioRepository;
    const service = new AudioUploadService(storage, repository);
    await assert.rejects(service.upload('owner', { path: source, originalname: 'teacher.wav', mimetype: 'audio/wav', size: 12 } as Express.Multer.File));
    assert.deepEqual(await readdir(path.join(directory, 'storage', 'audio')), []);
    await assert.rejects(access(source));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
