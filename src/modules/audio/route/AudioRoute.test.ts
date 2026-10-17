import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import EnvConfig from '../../../config/EnvConfig.ts';
import AudioRepository from '../repository/AudioRepository.ts';
import AppError from '../../../utils/AppError.ts';
import AuthService from '../../auth/service/AuthService.ts';
import RhythmPublisherService from '../service/RhythmPublisherService.ts';
import RhythmClientService from '../service/RhythmClientService.ts';
import { createApp } from '../../../app.ts';

interface Upload { id: string; url: string; ownerId: string; provider: string; key: string; deletingAt: null; }
interface Evaluation { evaluationId: string; ownerId: string; publicationState: string; }

test('HTTP: upload ngay, chỉ gửi URL khi so sánh, static root tùy chỉnh và quyền sở hữu', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-http-test-'));
  const originalRoot = EnvConfig.fileStorageLocalRoot;
  const originalOrigin = EnvConfig.fileStoragePublicBaseUrl;
  Object.defineProperty(EnvConfig, 'fileStorageLocalRoot', { value: directory });
  Object.defineProperty(EnvConfig, 'fileStoragePublicBaseUrl', { value: 'https://be.example.com' });
  const uploads: Upload[] = [];
  const evaluations: Evaluation[] = [];
  const jobs: Audio.Job[] = [];
  let completed = false;
  mock.method(AuthService, 'verifyAccessToken', ((token: string) => ({ userId: token === 'other' ? 'other' : 'owner' })) as never);
  mock.method(AuthService, 'getAuthenticatedUser', (async (userId: string) => ({ userId, username: userId, role: 1, email: 'test@example.com' })) as never);
  mock.method(AudioRepository.prototype, 'createUpload', async (data: Parameters<AudioRepository['createUpload']>[0]) => {
    const upload = { ...data, id: randomUUID(), deletingAt: null }; uploads.push(upload); return upload;
  });
  mock.method(AudioRepository.prototype, 'createRequest', async (ownerId: string, input: Audio.EvaluationInput, job: Audio.Job, provider: string) => {
    const owned = uploads.filter((upload) => upload.ownerId === ownerId && upload.provider === provider);
    if (!owned.some((upload) => upload.url === input.templateUrl) || !owned.some((upload) => upload.url === input.studentUrl)) {
      throw AppError.badRequest('URL không thuộc người dùng.');
    }
    evaluations.push({ evaluationId: job.evaluationId, ownerId, publicationState: 'publishing' });
  });
  mock.method(AudioRepository.prototype, 'updatePublication', async (evaluationId: string, publicationState: Audio.PublicationState) => {
    Object.assign(evaluations.find((record) => record.evaluationId === evaluationId)!, { publicationState });
  });
  mock.method(AudioRepository.prototype, 'findRequest', async (ownerId: string, evaluationId: string) => evaluations.find((record) => record.ownerId === ownerId && record.evaluationId === evaluationId) || null);
  mock.method(RhythmPublisherService.instance, 'publish', async (job: Audio.Job) => { jobs.push(job); return 'published'; });
  mock.method(RhythmClientService.prototype, 'get', async (evaluationId: string) => completed ? {
    evaluationId, status: 'completed', result: { overallScore: 85, pitchAccuracyPercent: 80, rhythmAccuracyPercent: 92.5, aiFeedback: 'Giữ nhịp tốt.' }, error: null
  } : null);
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
    const playback = await fetch(base + new URL(template.url).pathname);
    assert.equal(playback.status, 200); assert.equal(await playback.text(), 'RIFF0000WAVE');
    const compare = async (token = 'owner', templateUrl = template.url) => fetch(`${base}/api/v1/audio-evaluations`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ templateUrl, studentUrl: student.url })
    });
    assert.equal((await compare('other')).status, 400);
    assert.equal((await compare('owner', 'https://untrusted.example.com/audio.wav')).status, 400);
    const response = await compare(); assert.equal(response.status, 202);
    const record = (await response.json() as { data: Audio.EvaluationResponse }).data;
    assert.equal(jobs.length, 1); assert.equal(jobs[0].instrumentId, 'dan_bau');
    assert.equal(jobs[0].templateUrl, template.url); assert.equal(uploads.length, 2);
    const statusUrl = `${base}/api/v1/audio-evaluations/${record.evaluationId}`;
    assert.equal((await (await fetch(statusUrl, { headers })).json() as { data: Audio.EvaluationResponse }).data.status, 'queued');
    assert.equal((await fetch(statusUrl, { headers: { Authorization: 'Bearer other' } })).status, 404);
    completed = true;
    const result = (await (await fetch(statusUrl, { headers })).json() as { data: Audio.EvaluationResponse }).data;
    assert.equal(result.status, 'completed'); assert.equal(result.result?.overallScore, 85);
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
