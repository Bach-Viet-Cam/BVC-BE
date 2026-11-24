import VerifiedContentService from '../../community/service/VerifiedContentService.ts';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import EnvConfig from '../../../config/EnvConfig.ts';
import AudioRepository from '../repository/AudioRepository.ts';
import AuthService from '../../auth/service/AuthService.ts';
import RhythmPublisherService from '../service/RhythmPublisherService.ts';
import AudioFilePolicyService from '../service/AudioFilePolicyService.ts';
import CatalogService from '../../music-library/service/CatalogService.ts';
import MediaInspectionService from '../../music-library/service/MediaInspectionService.ts';
import AudioAccessRepository from '../../storage/repository/AudioAccessRepository.ts';
import { createApp } from '../../../app.ts';

interface Upload { id: string; url: string; ownerId: string; provider: string; key: string; deletingAt: null; }

test('HTTP: upload audio, static root tùy chỉnh và API demo so sánh không được expose', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-http-test-'));
  const originalRoot = EnvConfig.fileStorageLocalRoot;
  const originalOrigin = EnvConfig.fileStoragePublicBaseUrl;
  Object.defineProperty(EnvConfig, 'fileStorageLocalRoot', { value: directory });
  Object.defineProperty(EnvConfig, 'fileStoragePublicBaseUrl', { value: 'https://be.example.com' });
  mock.method(VerifiedContentService, 'isProtectedKey', async () => false);
  const uploads: Upload[] = [];
  const jobs: Audio.Job[] = [];
  mock.method(AuthService, 'verifyAccessToken', ((token: string) => ({ userId: token === 'other' ? 'other' : 'owner' })) as never);
  mock.method(AuthService, 'getAuthenticatedUser', (async (userId: string) => ({ userId, username: userId, role: 1, email: 'test@example.com' })) as never);
  mock.method(AudioRepository.prototype, 'createUpload', async (data: Parameters<AudioRepository['createUpload']>[0]) => {
    const upload = { ...data, id: randomUUID(), deletingAt: null }; uploads.push(upload); return upload;
  });
  // GBR-10 limits come from System Configuration; this HTTP test has no database, so they are fixed here
  mock.method(CatalogService, 'getFileRules', async () => ({ extensions: ['mp3', 'wav', 'm4a'], formatLabel: 'MP3, WAV, M4A', maxMb: 25, maxBytes: 25 * 1024 * 1024 }));
  mock.method(AudioFilePolicyService, 'readDuration', async () => 5);
  mock.method(MediaInspectionService, 'assertAudioDuration', async () => undefined);
  mock.method(RhythmPublisherService.instance, 'publish', async (job: Audio.Job) => { jobs.push(job); return 'published'; });
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: 'Bearer owner' };
  const upload = async () => {
    const form = new FormData(); form.append('file', new Blob(['RIFF0000WAVE'], { type: 'audio/wav' }), 'teacher.wav');
    return fetch(`${base}/api/v1/audio-uploads`, { method: 'POST', headers, body: form });
  };
  try {
    assert.equal((await fetch(`${base}/api/v1/audio-uploads`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/api/v1/audio-uploads`, { method: 'POST', headers, body: new FormData() })).status, 400);
    const first = await upload(); assert.equal(first.status, 201, await first.clone().text());
    const template = (await first.json() as { data: { url: string } }).data;
    const second = await upload(); assert.equal(second.status, 201);
    const student = (await second.json() as { data: { url: string } }).data;
    assert.equal(jobs.length, 0);
    // AD-010: the recording opens only for its owner (or a lecturer of its class / an admin)
    const filePath = base + new URL(template.url).pathname;
    mock.method(AudioAccessRepository, 'findUpload', async (key: string) => uploads.some((upload) => upload.key === key) ? { ownerId: 'owner', lecturerIds: [] } : null);
    const playback = await fetch(filePath, { headers });
    assert.equal(playback.status, 200); assert.equal(await playback.text(), 'RIFF0000WAVE');
    assert.equal((await fetch(filePath, { headers: { Authorization: 'Bearer other' } })).status, 404);
    assert.equal((await fetch(filePath)).status, 401);
    // API demo so sánh templateUrl/studentUrl không còn được expose.
    const compare = await fetch(`${base}/api/v1/audio-evaluations`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ templateUrl: template.url, studentUrl: student.url })
    });
    assert.equal(compare.status, 404);
    assert.equal((await fetch(`${base}/api/v1/audio-evaluations/${randomUUID()}`, { headers })).status, 404);
    assert.equal(jobs.length, 0); assert.equal(uploads.length, 2);
    assert.equal((await readdir(path.join(directory, 'audio'))).length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    mock.restoreAll();
    Object.defineProperty(EnvConfig, 'fileStorageLocalRoot', { value: originalRoot });
    Object.defineProperty(EnvConfig, 'fileStoragePublicBaseUrl', { value: originalOrigin });
    await rm(directory, { recursive: true, force: true });
  }
});
