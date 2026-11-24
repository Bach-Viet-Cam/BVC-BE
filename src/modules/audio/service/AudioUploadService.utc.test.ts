import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AppError from '../../../utils/AppError.ts';
import AudioUploadService from './AudioUploadService.ts';
import type AudioRepository from '../repository/AudioRepository.ts';
import type FileStorageService from '../../storage/service/FileStorageService.ts';

const FORMAT_MESSAGE = 'File phải là WAV hoặc MP3 với nội dung và định dạng audio phù hợp.';

describe('AudioUploadService.upload (UTC-AD)', () => {
  let directory: string;
  let source: string;
  let saveCalls: Array<Record<string, unknown>>;
  let deleteCalls: string[];
  let events: string[];
  let storageSaveError: Error | undefined;
  let repoError: Error | undefined;
  let created: Array<Record<string, unknown>>;
  let trimCalls: Array<{ filePath: string; extension: string; edges?: Audio.TrimEdges }>;
  let trimError: Error | undefined;

  const storage = (): FileStorageService => ({
    provider: 'local',
    save: async (input: Record<string, unknown>) => {
      events.push('save'); saveCalls.push(input);
      if (storageSaveError) throw storageSaveError;
      return { key: 'audio/stored-1.wav', sizeBytes: 12, contentType: input.contentType as string };
    },
    delete: async (key: string) => { deleteCalls.push(key); },
    getDownloadUrl: async (key: string) => `https://be.example.com/files/${key}`
  } as unknown as FileStorageService);
  const repository = (): AudioRepository => ({
    createUpload: async (record: Record<string, unknown>) => {
      created.push(record);
      if (repoError) throw repoError;
      return { id: 'up-1', url: record.url };
    }
  } as unknown as AudioRepository);
  const trimmer = { trimFile: async (filePath: string, extension: string, edges?: Audio.TrimEdges) => {
    events.push('trim'); trimCalls.push({ filePath, extension, edges });
    if (trimError) throw trimError;
    return false;
  } };
  const wavFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({ path: source, originalname: 'teacher.wav', mimetype: 'audio/wav', size: 12, ...overrides } as Express.Multer.File);
  const exists = async (p: string): Promise<boolean> => access(p).then(() => true, () => false);

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-utc-upload-'));
    source = path.join(directory, 'source.wav');
    await writeFile(source, 'RIFF0000WAVE');
    saveCalls = []; deleteCalls = []; events = []; created = []; trimCalls = [];
    storageSaveError = undefined; repoError = undefined; trimError = undefined;
  });
  afterEach(async () => { mock.restoreAll(); await rm(directory, { recursive: true, force: true }); });

  it('UTC-AD-012 stores a valid WAV and returns fileId and url', async () => {
    const result = await new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile());
    assert.deepEqual(result, { fileId: 'up-1', url: 'https://be.example.com/files/audio/stored-1.wav' });
    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0].namespace, 'audio'); assert.equal(saveCalls[0].contentType, 'audio/wav');
    assert.equal(created[0].ownerId, 'owner-1'); assert.equal(created[0].provider, 'local');
    assert.equal(await exists(source), false);
  });
  it('UTC-AD-013 rethrows repository error, deletes stored file and removes temp file', async () => {
    repoError = new Error('Lỗi DB giả lập.');
    await assert.rejects(new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile()), /Lỗi DB giả lập\./);
    assert.deepEqual(deleteCalls, ['audio/stored-1.wav']);
    assert.equal(await exists(source), false);
  });
  it('UTC-AD-014 rejects text renamed .wav, stores nothing and removes temp file', async () => {
    await writeFile(source, 'not an audio');
    await assert.rejects(new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile()),
      (e: unknown) => e instanceof AppError && e.statusCode === 400 && e.message === FORMAT_MESSAGE);
    assert.equal(saveCalls.length, 0); assert.equal(created.length, 0);
    assert.equal(await exists(source), false);
  });
  it('UTC-AD-015 rethrows storage.save error without calling delete', async () => {
    storageSaveError = new Error('Lỗi lưu file.');
    await assert.rejects(new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile()), /Lỗi lưu file\./);
    assert.equal(deleteCalls.length, 0);
    assert.equal(await exists(source), false);
  });

  // New cases
  it('UTC-AD-061 trims with both edges by default (source "file") and passes wav extension', async () => {
    await new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile());
    assert.equal(trimCalls.length, 1);
    assert.equal(trimCalls[0].extension, 'wav'); assert.equal(trimCalls[0].edges, 'both'); assert.equal(trimCalls[0].filePath, source);
  });
  it('UTC-AD-062 trims only the end for source "recording"', async () => {
    await new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile(), 'recording');
    assert.equal(trimCalls[0].edges, 'end');
  });
  it('UTC-AD-063 uses mp3 extension for MP3 uploads and saves as audio/mpeg', async () => {
    const mp3 = path.join(directory, 'source.mp3');
    await writeFile(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
    await new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', { path: mp3, originalname: 'student.mp3', mimetype: 'audio/mpeg', size: 4 } as Express.Multer.File);
    assert.equal(trimCalls[0].extension, 'mp3'); assert.equal(saveCalls[0].contentType, 'audio/mpeg');
    assert.equal(saveCalls[0].originalName, 'student.mp3');
  });
  it('UTC-AD-064 trims before saving to storage', async () => {
    await new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile());
    assert.deepEqual(events, ['trim', 'save']);
  });
  it('UTC-AD-065 trimmer failure aborts upload before storage and removes temp file', async () => {
    trimError = new Error('trim lỗi');
    await assert.rejects(new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', wavFile()), /trim lỗi/);
    assert.equal(saveCalls.length, 0); assert.equal(deleteCalls.length, 0);
    assert.equal(await exists(source), false);
  });
  it('UTC-AD-066 undefined file rejects 400 without touching storage or trimmer', async () => {
    await assert.rejects(new AudioUploadService(storage(), repository(), trimmer).upload('owner-1', undefined),
      (e: unknown) => e instanceof AppError && e.statusCode === 400 && e.message === 'Vui lòng chọn một file audio.');
    assert.equal(trimCalls.length, 0); assert.equal(saveCalls.length, 0);
  });
  it('UTC-AD-067 logs when cleanup of stored file fails after metadata error but still rethrows original error', async () => {
    repoError = new Error('Lỗi DB giả lập.');
    const errorLog = mock.method(console, 'error', () => undefined);
    const failingStorage = { ...storage(), provider: 'local', save: storage().save, getDownloadUrl: storage().getDownloadUrl, delete: async () => { throw new Error('delete fail'); } } as unknown as FileStorageService;
    await assert.rejects(new AudioUploadService(failingStorage, repository(), trimmer).upload('owner-1', wavFile()), /Lỗi DB giả lập\./);
    assert.equal(errorLog.mock.calls[0].arguments[0], 'Không thể dọn audio sau khi lưu metadata thất bại.');
  });
});
