import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TestContext from './support/TestContext.ts';
import RhythmPublisherService from '../src/modules/audio/service/RhythmPublisherService.ts';

const { app, api, prisma } = TestContext;
// EnvConfig reads the secret when it is first imported, so it must be set before the imports run
const callbackSecret = vi.hoisted(() => {
  process.env.AI_CALLBACK_SECRET = 'test-callback-secret';
  return 'test-callback-secret';
});

describe('Luyện tập lại đoạn lỗi (UC-03)', () => {
  let student: Awaited<ReturnType<typeof TestContext.createUser>>;
  let submissionId: string;
  let uploadId: string;
  const published: unknown[] = [];

  beforeEach(async () => {
    await TestContext.reset();
    const lecturer = await TestContext.createUser('LECTURER', 'gv@test.local');
    student = await TestContext.createUser('STUDENT', 'hs@test.local');
    const { piece, mainSheet } = await TestContext.createPublishedPiece(lecturer);
    submissionId = (await prisma.submission.create({
      data: {
        pieceId: piece.id, sheetMusicId: mainSheet.id, studentId: student.id, status: 'COMPLETED', accuracy: 70,
        evaluationId: randomUUID(), messageId: randomUUID(), result: { overallScore: 70, studentAudioQuality: { audio: { durationSec: 30 } } }
      }
    })).id;
    uploadId = (await prisma.audioUpload.create({
      data: { ownerId: student.id, provider: 'local', key: `k-${randomUUID()}`, url: `http://localhost/${randomUUID()}.wav`, originalName: 's.wav', contentType: 'audio/wav', sizeBytes: 10 }
    })).id;
    published.length = 0;
    vi.spyOn(RhythmPublisherService.instance, 'publish').mockImplementation(async (job) => { published.push(job); return 'published'; });
  });

  afterEach(() => vi.restoreAllMocks());

  async function createSegment() {
    return request(app).post(`${api}/practice/submissions/${submissionId}/segments`).set(TestContext.auth(student))
      .send({ startSec: 2, endSec: 6, studentUploadId: uploadId });
  }

  it('POST tạo lượt luyện đoạn PROCESSING và không tạo submission mới', async () => {
    const response = await createSegment();
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ submissionId, startSec: 2, endSec: 6, status: 'PROCESSING' });
    expect(published).toHaveLength(1);
    expect(await prisma.submission.count()).toBe(1);
  });

  it('GET trả lượt luyện và danh sách theo submission', async () => {
    const created = await createSegment();
    const one = await request(app).get(`${api}/practice/segments/${created.body.data.id}`).set(TestContext.auth(student));
    expect(one.status).toBe(200);
    expect(one.body.data.id).toBe(created.body.data.id);
    const list = await request(app).get(`${api}/practice/submissions/${submissionId}/segments`).set(TestContext.auth(student));
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.nextCursor).toBeNull();
  });

  it('đoạn vượt thời lượng → 400', async () => {
    const response = await request(app).post(`${api}/practice/submissions/${submissionId}/segments`).set(TestContext.auth(student))
      .send({ startSec: 2, endSec: 99, studentUploadId: uploadId });
    expect(response.status).toBe(400);
  });

  it('callback thiếu secret → 401', async () => {
    const response = await request(app).post(`${api}/internal/practice-segments/progress`).send({ evaluationId: 'x', attempt: 1, job: 'feedback', status: 'started' });
    expect(response.status).toBe(401);
  });

  it('callback có secret với điểm null → 200 và lượt luyện COMPLETED', async () => {
    const created = await createSegment();
    const record = await prisma.practiceSegmentAttempt.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const response = await request(app).post(`${api}/internal/practice-segments/progress`).set('X-Callback-Secret', callbackSecret).send({
      evaluationId: record.evaluationId, attempt: 1, job: 'feedback', status: 'done',
      result: { overallScore: null, pitchAccuracyPercent: null, rhythmAccuracyPercent: null, aiFeedback: 'Đoạn này không có nốt.', baseline: null }
    });
    expect(response.status).toBe(200);
    expect(response.body.data.isApplied).toBe(true);
    const updated = await prisma.practiceSegmentAttempt.findUniqueOrThrow({ where: { id: record.id } });
    expect(updated.status).toBe('COMPLETED');
    expect(updated.accuracy).toBeNull();
  });
});
