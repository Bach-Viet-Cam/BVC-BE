import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AudioUploadService from './AudioUploadService.ts';
import LocalFileStorageService from '../../storage/service/LocalFileStorageService.ts';
import type AudioRepository from '../repository/AudioRepository.ts';

test('Upload cắt theo cao độ trên file tạm trước khi lưu', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-upload-trim-test-'));
  try {
    const source = path.join(directory, 'source.wav'); await writeFile(source, 'RIFF0000WAVE-goc');
    const storage = new LocalFileStorageService(path.join(directory, 'storage'), 'https://be.example.com');
    const repository = { createUpload: async (record: { key: string }) => ({ id: 'file-1', url: record.key }) } as unknown as AudioRepository;
    const trimCalls: string[] = [];
    const trimmer = { trimFile: async (filePath: string, extension: string, edges?: Audio.TrimEdges) => { trimCalls.push(`${extension}:${edges}`); await writeFile(filePath, 'RIFF0000WAVE-cat'); return true; } };
    const service = new AudioUploadService(storage, repository, trimmer);
    await service.upload('owner', { path: source, originalname: 'teacher.wav', mimetype: 'audio/wav', size: 16 } as Express.Multer.File);
    const recordingSource = path.join(directory, 'recording.wav'); await writeFile(recordingSource, 'RIFF0000WAVE-goc');
    await service.upload('owner', { path: recordingSource, originalname: 'ban-thu.wav', mimetype: 'audio/wav', size: 16 } as Express.Multer.File, 'recording');
    // File tải lên cắt cả hai đầu, bản ghi âm trực tiếp chỉ cắt cuối
    assert.deepEqual(trimCalls, ['wav:both', 'wav:end']);
    for (const storedName of await readdir(path.join(directory, 'storage', 'audio'))) {
      assert.equal(await readFile(path.join(directory, 'storage', 'audio', storedName), 'utf8'), 'RIFF0000WAVE-cat');
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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
