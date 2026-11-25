import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import type { Response as ApiResponse } from 'supertest';
import { expect, vi } from 'vitest';
import SampleMediaFactory from '../../prisma/seed/SampleMediaFactory.ts';
import { createApp } from '../../src/app.ts';
import EnvConfig from '../../src/config/EnvConfig.ts';
import RhythmClientService from '../../src/modules/audio/service/RhythmClientService.ts';
import RhythmPublisherService from '../../src/modules/audio/service/RhythmPublisherService.ts';
import TextNormalizer from '../../src/utils/TextNormalizer.ts';
import TestDatabase from './TestDatabase.ts';

type TestUser = Awaited<ReturnType<typeof TestDatabase.createUser>>;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface SheetOptions {
  kind?: 'MAIN' | 'LEVEL';
  name?: string;
  hasReferenceAudio?: boolean;
  isAnalysed?: boolean;
  visibility?: 'PUBLIC' | 'HIDDEN';
}

// Data and request helpers for the Report 5.2 scripts of Student Dashboard, Practice Submissions, Weekly Challenges,
// Leaderboard and Verified Recordings. RabbitMQ and the Rhythm service are replaced at their client classes.
export default class PracticeCommunityFixture {
  static readonly app = createApp();
  static readonly api = '/api/v1';
  static readonly callbackSecret = 'test-callback-secret';
  static readonly unknownId = '00000000-0000-4000-8000-000000000000';

  static readonly messages = {
    unauthorized: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    forbidden: 'Bạn không có quyền thực hiện thao tác này.',
    forbiddenRole: 'Bạn không có quyền truy cập chức năng này.',
    invalidData: 'Kiểm tra lại dữ liệu gửi đi',
    processing: 'Bản thu đang được xử lý. Kết quả sẽ hiển thị khi phân tích hoàn tất.',
    submissionNotFound: 'Không tìm thấy bản nộp.',
    sheetNotFound: 'Không tìm thấy bản nhạc đã chọn của bài này.',
    uploadInvalid: 'File ghi âm không hợp lệ hoặc bạn không có quyền sử dụng file.',
    retryNotAllowed: 'Bản nộp này không thể xử lý lại.',
    retryTooEarly: 'Bạn có thể thử lại sau ít giây nữa.',
    pitchUnavailable: 'Chưa có dữ liệu cao độ để hiển thị biểu đồ so sánh.',
    segmentNotFound: 'Không tìm thấy lượt luyện đoạn.',
    segmentInvalid: 'Đoạn luyện tập không hợp lệ.',
    challengeNotFound: 'Không tìm thấy thử thách.',
    contentChanged: 'Nội dung đã thay đổi. Vui lòng tải lại.',
    contentRevoked: 'Nội dung đã bị thu hồi, không thể hiển thị lại.',
    contentNotFound: 'Nội dung xác minh không tồn tại.'
  };

  static get prisma() {
    return TestDatabase.prisma;
  }

  // ---------------------------------------------------------------- Requests

  static send(method: Method, url: string, user?: TestUser, body?: unknown) {
    let pending = request(PracticeCommunityFixture.app)[method](`${PracticeCommunityFixture.api}${url}`);
    if (user) pending = pending.set('Authorization', TestDatabase.tokenFor(user));
    return body === undefined ? pending : pending.send(body as object);
  }

  static get(url: string, user?: TestUser) {
    return PracticeCommunityFixture.send('get', url, user);
  }

  static post(url: string, body: unknown, user?: TestUser) {
    return PracticeCommunityFixture.send('post', url, user, body);
  }

  static put(url: string, body: unknown, user?: TestUser) {
    return PracticeCommunityFixture.send('put', url, user, body);
  }

  static patch(url: string, body: unknown, user?: TestUser) {
    return PracticeCommunityFixture.send('patch', url, user, body);
  }

  static delete(url: string, user?: TestUser) {
    return PracticeCommunityFixture.send('delete', url, user);
  }

  // Rhythm → backend callback
  static callback(target: 'practice-submissions' | 'practice-segments', body: object, secret: string = PracticeCommunityFixture.callbackSecret) {
    return request(PracticeCommunityFixture.app)
      .post(`${PracticeCommunityFixture.api}/internal/${target}/progress`)
      .set('X-Callback-Secret', secret)
      .send(body);
  }

  // Never reaches a real queue or Rhythm service: publishing succeeds and Rhythm has no answer yet
  static stubRhythm() {
    Object.defineProperty(EnvConfig, 'aiCallbackSecret', { value: PracticeCommunityFixture.callbackSecret, configurable: true });
    const publish = vi.spyOn(RhythmPublisherService.instance, 'publish').mockResolvedValue('published');
    vi.spyOn(RhythmClientService.prototype, 'get').mockResolvedValue(null);
    vi.spyOn(RhythmClientService.prototype, 'getAnalysis').mockResolvedValue(null);
    return { publish };
  }

  // ---------------------------------------------------------------- Users and music data

  static async student(username: string): Promise<TestUser> {
    return TestDatabase.createUser({ username, role: TestDatabase.roles.STUDENT });
  }

  static async teacher(username: string): Promise<TestUser> {
    return TestDatabase.createUser({ username, role: TestDatabase.roles.TEACHER });
  }

  static async admin(): Promise<TestUser> {
    return TestDatabase.createUser({ username: 'Admin', role: TestDatabase.roles.SYSTEM_ADMIN });
  }

  static async createSong(instrumentId: string, title: string) {
    const piece = await TestDatabase.createPiece(instrumentId, { title, kind: 'SONG' });
    return TestDatabase.prisma.piece.update({ where: { id: piece.id }, data: { titleNormalized: TextNormalizer.normalize(title) } });
  }

  static async createSheet(pieceId: string, instrumentId: string, options: SheetOptions = {}) {
    const { kind = 'MAIN', hasReferenceAudio = true, isAnalysed = true, visibility = 'PUBLIC' } = options;
    const uploader = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    const level = await TestDatabase.prisma.category.upsert({
      where: { type_name: { type: 'LEVEL', name: 'Trình độ test' } }, update: {}, create: { type: 'LEVEL', name: 'Trình độ test' }
    });
    const sequence = TestDatabase.nextId();
    const createFile = (fileKind: 'SHEET' | 'AUDIO', suffix: string) => TestDatabase.prisma.mediaFile.create({
      data: {
        kind: fileKind, status: 'READY', storageKey: `test/${sequence}-${suffix}`, originalName: suffix,
        mimeType: 'application/octet-stream', sizeBytes: 10, uploadedById: uploader.id
      }
    });
    const sheetFile = await createFile('SHEET', 'sheet.pdf');
    const referenceAudio = hasReferenceAudio ? await createFile('AUDIO', 'ref.wav') : null;
    return TestDatabase.prisma.sheetMusic.create({
      data: {
        pieceId, instrumentId, kind, visibility,
        mainInstrumentId: kind === 'MAIN' ? instrumentId : null,
        name: options.name ?? (kind === 'MAIN' ? 'Bản chính' : `Bản ${sequence}`),
        levelId: level.id, sheetFileId: sheetFile.id, referenceAudioId: referenceAudio?.id ?? null,
        analysisStatus: isAnalysed ? 'READY' : 'NONE', analysisFileUrl: isAnalysed ? `test/${sequence}-analysis.json` : null,
        uploaderId: uploader.id
      }
    });
  }

  // ---------------------------------------------------------------- Recordings and submissions

  // A stored recording owned by the student, with a real file in the local test storage
  static async createUpload(ownerId: string) {
    const key = `audio/${randomUUID()}.wav`;
    const filePath = path.join(EnvConfig.fileStorageLocalRoot, key);
    const content = SampleMediaFactory.createWav(1);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return TestDatabase.prisma.audioUpload.create({
      data: {
        ownerId, provider: 'local', key, url: `${EnvConfig.fileStoragePublicBaseUrl}/uploads/${key}`,
        originalName: 'ban-thu.wav', contentType: 'audio/wav', sizeBytes: content.length
      }
    });
  }

  static async createSubmission(
    data: Pick<Prisma.SubmissionUncheckedCreateInput, 'studentId' | 'pieceId'> & Partial<Prisma.SubmissionUncheckedCreateInput>
  ) {
    const status = data.status ?? 'COMPLETED';
    return TestDatabase.prisma.submission.create({
      data: {
        fileUrl: '/samples/bvc-sample.wav',
        evaluationId: randomUUID(),
        publicationState: 'published',
        stage: status === 'COMPLETED' ? 'FEEDBACK' : 'QUALITY_CHECK',
        ...(status === 'COMPLETED' ? { accuracy: 80, analyzedAt: new Date() } : {}),
        ...data,
        status
      }
    });
  }

  static analysisResult(overrides: Record<string, unknown> = {}): Prisma.InputJsonObject {
    return {
      overallScore: 82.5, pitchAccuracyPercent: 80, rhythmAccuracyPercent: 85, aiFeedback: 'Giữ nhịp tốt.',
      rhythmSegments: [{ startTime: 4, endTime: 5, status: 'fast' }],
      pitchErrorSegments: [{ startTime: 1, endTime: 2, averageCentsDifference: 25 }],
      studentAudioQuality: { audio: { durationSec: 30 }, warnings: [] },
      ...overrides
    } as Prisma.InputJsonObject;
  }

  static pitchChart(): Prisma.InputJsonObject {
    return { durationSec: 30, minHz: 400, maxHz: 480, points: [[0, 440, 441], [1, 440, null]], segments: [], timeMap: [[0, 0], [30, 30]] };
  }

  // Pitch block Rhythm sends with a segment result
  static segmentPitch(): Prisma.InputJsonObject {
    return { sampleRate: 16_000, hopLength: 160, teacherF0Hz: [440, 442, 444], studentF0Hz: [439, 441, 445], studentFrameByTeacherFrame: [0, 1, 2] };
  }

  static async createSegment(
    submission: { id: string; studentId: string },
    data: Partial<Prisma.PracticeSegmentAttemptUncheckedCreateInput> = {}
  ) {
    return TestDatabase.prisma.practiceSegmentAttempt.create({
      data: {
        submissionId: submission.id, studentId: submission.studentId, startSec: 2, endSec: 6.5, status: 'COMPLETED', stage: 'FEEDBACK',
        evaluationId: randomUUID(), messageId: randomUUID(), publicationState: 'published', ...data
      }
    });
  }

  static async notificationsOf(userId: string) {
    const rows = await TestDatabase.prisma.userNotification.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, include: { notification: { select: { title: true, body: true } } }
    });
    return rows.map((row) => row.notification);
  }

  // ---------------------------------------------------------------- Assertions

  static expectError(response: ApiResponse, status: number, expected: Record<string, unknown>) {
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ success: false, ...expected });
  }

  static expectValidationError(response: ApiResponse, field: string) {
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, field, message: PracticeCommunityFixture.messages.invalidData });
    expect(response.body.code).toBeUndefined();
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  }

  // Rules on the whole body (an extra key, a relation between fields) have no field; errors[0].message names the problem
  static expectBodyError(response: ApiResponse, problem: string) {
    PracticeCommunityFixture.expectError(response, 400, { message: PracticeCommunityFixture.messages.invalidData });
    expect(response.body).not.toHaveProperty('field');
    expect(response.body.errors[0].message).toContain(problem);
  }

  static expectForbidden(response: ApiResponse) {
    PracticeCommunityFixture.expectError(response, 403, { message: PracticeCommunityFixture.messages.forbidden });
  }

  static expectForbiddenRole(response: ApiResponse) {
    PracticeCommunityFixture.expectError(response, 403, { message: PracticeCommunityFixture.messages.forbiddenRole });
  }

  static expectUnauthorized(response: ApiResponse) {
    PracticeCommunityFixture.expectError(response, 401, { message: PracticeCommunityFixture.messages.unauthorized });
  }
}
