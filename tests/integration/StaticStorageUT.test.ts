import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VerifiedContentService from '../../src/modules/community/service/VerifiedContentService.ts';
import SampleMediaFactory from '../../prisma/seed/SampleMediaFactory.ts';
import TestContext from '../support/TestContext.ts';

const { app, prisma } = TestContext;
const storageRoot = path.resolve('storage-test');

function getBinary(pathname: string) {
  return request(app).get(pathname).buffer(true).parse((response, callback) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

describe('StaticStorageIntegration (UTC)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;

  beforeEach(async () => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'static-ut@test.local');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ITC028 - File ảnh công khai được serve kèm header và chặn file ẩn', async () => {
    const coverDirectory = path.join(storageRoot, 'cover');
    fs.mkdirSync(coverDirectory, { recursive: true });
    fs.writeFileSync(path.join(coverDirectory, 'bvc-cover.png'), SampleMediaFactory.tinyPng);
    fs.writeFileSync(path.join(coverDirectory, '.hidden.png'), SampleMediaFactory.tinyPng);

    const response = await getBinary('/uploads/cover/bvc-cover.png');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.compare(response.body, SampleMediaFactory.tinyPng)).toBe(0);

    const hidden = await getBinary('/uploads/cover/.hidden.png');
    expect(hidden.status).toBe(404);
  });

  it('ITC029 - Bản thu thật được serve qua /uploads/audio với header riêng tư', async () => {
    const fileId = await TestContext.uploadWav(lecturer, 2);
    const confirm = await request(app).post(`${TestContext.api}/uploads/${fileId}/confirm`).set(TestContext.auth(lecturer));
    expect(confirm.status).toBe(200);
    const mediaFile = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(mediaFile.status).toBe('READY');
    const relativeKey = mediaFile.storageKey.replace(/^audio\//, '');
    const audioPath = `/uploads/audio/${relativeKey}`;
    expect(fs.existsSync(path.join(storageRoot, mediaFile.storageKey))).toBe(true);

    const response = await getBinary(audioPath);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('audio/wav');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.length).toBeGreaterThan(44);
    expect(response.body.toString('ascii', 0, 4)).toBe('RIFF');

    const ranged = await getBinary(audioPath).set('Range', 'bytes=0-3');
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-range']).toMatch(/^bytes 0-3\//);
    expect(ranged.body.length).toBe(4);

    const invalidKey = await getBinary('/uploads/audio/khong-phai-khoa-hop-le.wav');
    expect(invalidKey.status).toBe(404);

    vi.spyOn(VerifiedContentService, 'isProtectedKey').mockResolvedValue(true);
    const protectedResponse = await getBinary(audioPath).set(TestContext.auth(lecturer));

    expect(protectedResponse.status).toBe(404);
    expect(JSON.stringify(protectedResponse.body)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(protectedResponse.body)).not.toContain(mediaFile.storageKey);
  });
});
