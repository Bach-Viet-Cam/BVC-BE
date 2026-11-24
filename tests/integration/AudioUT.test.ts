import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RhythmClientService from '../../src/modules/audio/service/RhythmClientService.ts';
import RhythmPublisherService from '../../src/modules/audio/service/RhythmPublisherService.ts';
import SampleMediaFactory from '../../prisma/seed/SampleMediaFactory.ts';
import TestContext from '../support/TestContext.ts';

const { app, api, prisma } = TestContext;
const storageRoot = path.resolve('storage-test');

interface UploadResult { fileId: string; url: string; }

function getBinary(pathname: string) {
  return request(app).get(pathname).buffer(true).parse((response, callback) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

describe('AudioIntegration (UTC)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;

  async function uploadAudioFile(): Promise<UploadResult> {
    const response = await request(app).post(`${api}/audio-uploads`).set(TestContext.auth(lecturer))
      .attach('file', SampleMediaFactory.createWav(2), 'ban-thu.wav');
    expect(response.status).toBe(201);
    return response.body.data as UploadResult;
  }

  beforeEach(async () => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'audio-ut@test.local');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ITC030 - Upload WAV rồi phát lại qua static URL', async () => {
    const uploaded = await uploadAudioFile();

    expect(uploaded.url).toContain('/uploads/audio/');
    const record = await prisma.audioUpload.findUniqueOrThrow({ where: { id: uploaded.fileId } });
    expect(record.ownerId).toBe(lecturer.id);
    expect(record.contentType).toBe('audio/wav');
    expect(record.key).toBe(`audio/${path.posix.basename(new URL(uploaded.url).pathname)}`);
    expect(fs.existsSync(path.join(storageRoot, record.key))).toBe(true);

    const playback = await getBinary(new URL(uploaded.url).pathname);

    expect(playback.status).toBe(200);
    expect(playback.headers['content-type']).toContain('audio/wav');
    expect(playback.body.length).toBeGreaterThan(44);
    expect(playback.body.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('ITC031 - Tạo evaluation rồi polling kết quả, không lộ key nội bộ', async () => {
    const template = await uploadAudioFile();
    const student = await uploadAudioFile();
    let completed = false;
    const publishSpy = vi.spyOn(RhythmPublisherService.instance, 'publish').mockResolvedValue('published');
    vi.spyOn(RhythmClientService.prototype, 'get').mockImplementation(async (evaluationId) => {
      if (!completed) return null;
      return {
        evaluationId,
        status: 'completed',
        result: { overallScore: 85, pitchAccuracyPercent: 80, rhythmAccuracyPercent: 90, aiFeedback: 'Giữ nhịp tốt.' },
        error: null
      };
    });

    const create = await request(app).post(`${api}/audio-evaluations`).set(TestContext.auth(lecturer))
      .send({ templateUrl: template.url, studentUrl: student.url });

    expect(create.status).toBe(202);
    const evaluationId = create.body.data.evaluationId as string;
    expect(evaluationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(create.body.data.status).toBe('queued');
    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(await prisma.audioEvaluationRequest.count({ where: { evaluationId, ownerId: lecturer.id } })).toBe(1);

    const pending = await request(app).get(`${api}/audio-evaluations/${evaluationId}`).set(TestContext.auth(lecturer));
    expect(pending.status).toBe(200);
    expect(pending.body.data.status).toBe('queued');

    completed = true;
    const finished = await request(app).get(`${api}/audio-evaluations/${evaluationId}`).set(TestContext.auth(lecturer));
    expect(finished.status).toBe(200);
    expect(finished.body.data.status).toBe('completed');
    expect(finished.body.data.result.overallScore).toBe(85);

    const serialized = JSON.stringify(finished.body);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain(template.url);
    expect(serialized).not.toContain(student.url);
    const templateRecord = await prisma.audioUpload.findUniqueOrThrow({ where: { id: template.fileId } });
    expect(serialized).not.toContain(templateRecord.key);
  });
});
