// Report-5.2 Integration Test, sheet "Audio & Ensemble" (ITC-AD-*) and ITC-RT-018 of "Rhythm Template Analysis".
// The flow cases (AD-029 .. AD-033, RT-018) run the real Rhythm service and RabbitMQ; see tests/support/ItcHarness.ts.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// EnvConfig reads these when it is first imported, so they are set before the imports run
const settings = vi.hoisted(() => {
  const values = {
    bePort: Number(process.env.ITC_BE_PORT || 39171),
    rhythmPort: Number(process.env.ITC_RHYTHM_PORT || 39172),
    geminiPort: Number(process.env.ITC_GEMINI_PORT || 39173),
    internalKey: 'itc-internal-key-0001',
    callbackSecret: 'itc-callback-secret-0001',
    rabbitUrl: process.env.ITC_RABBITMQ_URL || 'amqp://guest:guest@localhost:5672/'
  };
  process.env.RABBITMQ_URL = values.rabbitUrl;
  process.env.RHYTHM_SERVICE_BASE_URL = `http://127.0.0.1:${values.rhythmPort}`;
  process.env.RHYTHM_SERVICE_INTERNAL_API_KEY = values.internalKey;
  process.env.AI_CALLBACK_SECRET = values.callbackSecret;
  process.env.FILE_STORAGE_PUBLIC_BASE_URL = `http://127.0.0.1:${values.bePort}`;
  process.env.FILE_STORAGE_LOCAL_ROOT = './storage-itc';
  return values;
});

import EnvConfig from '../src/config/EnvConfig.ts';
import AuthService from '../src/modules/auth/service/AuthService.ts';
import TestContext from './support/TestContext.ts';
import TestDatabase from './integration/TestDatabase.ts';
import ItcHarness from './support/ItcHarness.ts';

const { app, api, prisma } = TestContext;
const harness = new ItcHarness(settings);
const LIMITS = { maxMb: 2, minSec: 2, maxSec: 8 };
const MSG13 = 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng MP3, WAV, M4A.';
const MSG14 = `File vượt quá dung lượng tối đa ${LIMITS.maxMb} MB.`;
const MSG15 = 'Thời lượng bản thu phải nằm trong khoảng từ 0:02 đến 0:08.';
const JWT_INVALID = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
const FORBIDDEN = 'Bạn không có quyền truy cập chức năng này.';
const NO_TRACKS = 'Bài nhạc này chưa có track hòa tấu ảo nên chưa thể luyện cùng ensemble.';
const ASSIGNMENT_GONE = 'Không thể mở bài tập vì bài tập không còn khả dụng.';
const ANALYSIS_LABELS: Record<string, string> = { PROCESSING: 'Đang chuẩn bị', READY: 'Sẵn sàng', ERROR: 'Lỗi phân tích' };

interface Actor { id: string; token: string; }
const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });
const day = 24 * 60 * 60 * 1000;

const world = {} as {
  gvA: Actor; sv1: Actor; sv2: Actor; sv9: Actor; admin: Actor;
  tranh: string; bau: string; sao: string;
  c1: string; c2: string; c3: string;
  p1: string; p2: string; p3: string; p4: string; p5: string;
  s1: string; s2: string; s4piece: string;
  ae: string; as1: string; aClosed: string; aPast: string; aNoBpm: string; aUsed: string; aDraft: string; a2: string; ax: string; aEnded: string;
};

async function createAdmin(): Promise<Actor> {
  const user = await prisma.user.create({ data: { email: 'ad1@test.local', username: 'ad1', role: TestDatabase.roles.SYSTEM_ADMIN } });
  return { id: user.id, token: AuthService.createAccessToken(user) };
}

async function audioMedia(ownerId: string, status: 'READY' | 'PENDING' = 'READY') {
  return prisma.mediaFile.create({
    data: { kind: 'AUDIO', status, storageKey: `itc/${randomUUID()}.wav`, originalName: 'track.wav', mimeType: 'audio/wav', sizeBytes: 1000, durationSec: 6, uploadedById: ownerId }
  });
}

async function mainSheet(pieceId: string, instrumentId: string, ownerId: string, audio: 'READY' | 'PENDING' | null = 'READY') {
  const level = await prisma.category.findFirstOrThrow({ where: { type: 'LEVEL' } });
  const sheetFile = await prisma.mediaFile.create({
    data: { kind: 'SHEET', status: 'READY', storageKey: `itc/${randomUUID()}.pdf`, originalName: 's.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedById: ownerId }
  });
  const reference = audio ? await audioMedia(ownerId, audio) : null;
  return prisma.sheetMusic.create({
    data: {
      pieceId, instrumentId, mainInstrumentId: instrumentId, kind: 'MAIN', name: `Bản chính ${randomUUID().slice(0, 6)}`, levelId: level.id,
      sheetFileId: sheetFile.id, referenceAudioId: reference?.id ?? null, durationSec: 6, uploaderId: ownerId, visibility: 'PUBLIC'
    }
  });
}

async function piece(ownerId: string, bpm: number, visibility: 'PUBLIC' | 'HIDDEN' = 'PUBLIC') {
  const genre = await prisma.category.findFirstOrThrow({ where: { type: 'GENRE' } });
  return prisma.piece.create({ data: { title: `Bài ${randomUUID().slice(0, 6)}`, ownerId, genreId: genre.id, kind: 'SONG', bpm, visibility } });
}

async function classRecord(ownerId: string, instrumentId: string, startOffsetDays: number, status: 'ACTIVE' | 'ENDED' = 'ACTIVE') {
  const start = new Date(Date.now() + startOffsetDays * day);
  return prisma.class.create({
    data: { name: `Lớp ${randomUUID().slice(0, 6)}`, instrumentId, ownerId, startDate: start, endDate: new Date(start.getTime() + 60 * day), status, endedAt: status === 'ENDED' ? new Date() : null }
  });
}

async function member(classId: string, userId: string, instrumentId: string) {
  return prisma.classMember.create({ data: { classId, userId, instrumentId, source: 'MANUAL' } });
}

async function assignment(classId: string, sheetMusicId: string, createdById: string, options: {
  kind: 'SOLO' | 'ENSEMBLE'; status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; deadlineDays?: number; targetBpm?: number | null; maxSubmissions?: number | null;
}): Promise<string> {
  const status = options.status ?? 'PUBLISHED';
  const created = await prisma.assignment.create({
    data: {
      classId, sheetMusicId, title: `Bài tập ${randomUUID().slice(0, 6)}`, type: 'PRACTICE', createdById,
      deadline: new Date(Date.now() + (options.deadlineDays ?? 30) * day), isPublished: status !== 'DRAFT', status,
      ...(options.targetBpm ? { targetBpm: options.targetBpm } : {}),
      ...(options.maxSubmissions ? { maxSubmissions: options.maxSubmissions } : {}),
      ...(status === 'DRAFT' ? {} : { publishedAt: new Date() })
    }
  });
  const version = await prisma.assignmentVersion.create({
    data: { assignmentId: created.id, version: 1, title: created.title, kind: options.kind, sheetMusicId, requiredBpm: options.targetBpm ?? null, createdById }
  });
  await prisma.assignment.update({ where: { id: created.id }, data: { currentVersionId: version.id } });
  return created.id;
}

async function seedLimits(): Promise<void> {
  const rows = [
    ['upload.audio.max_mb', String(LIMITS.maxMb)], ['upload.audio.min_duration_sec', String(LIMITS.minSec)], ['upload.audio.max_duration_sec', String(LIMITS.maxSec)]
  ];
  for (const [key, value] of rows) {
    await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value, label: key, valueType: 'NUMBER', group: 'FILE_LIMIT' } });
  }
}

async function seedWorld(): Promise<void> {
  await TestDatabase.reset();
  await TestContext.seedCatalog();
  await seedLimits();
  const { instruments } = TestContext.catalog;
  world.tranh = instruments.DAN_TRANH;
  world.bau = instruments.DAN_BAU;
  world.sao = instruments.SAO_TRUC;
  world.gvA = await TestContext.createUser('LECTURER', 'gva@test.local');
  world.sv1 = await TestContext.createUser('STUDENT', 'sv1@test.local');
  world.sv2 = await TestContext.createUser('STUDENT', 'sv2@test.local');
  world.sv9 = await TestContext.createUser('STUDENT', 'sv9@test.local');
  world.admin = await createAdmin();

  // P1 (BPM 80): main sheet of Đàn tranh through the real upload flow, Đàn bầu and Sáo trúc tracks;
  // the Sáo trúc recording is not READY, so it is a track but not a ready main sheet (ITC-AD-023).
  const p1 = await TestContext.createPiece(world.gvA);
  world.p1 = p1.id;
  await prisma.piece.update({ where: { id: p1.id }, data: { bpm: 80, visibility: 'PUBLIC' } });
  const s1Response = await TestContext.createSheet(world.gvA, p1.id, {
    name: 'Bản chính', instrumentId: world.tranh,
    referenceAudioId: await TestContext.upload(world.gvA, 'AUDIO', 'mau.wav', 'audio/wav', ItcHarness.melodyWav(6)), visibility: 'PUBLIC'
  });
  if (s1Response.status !== 201) throw new Error(`create sheet failed: ${JSON.stringify(s1Response.body)}`);
  world.s1 = s1Response.body.data.id;
  await prisma.sheetMusic.update({ where: { id: world.s1 }, data: { kind: 'MAIN', mainInstrumentId: world.tranh } });
  await mainSheet(p1.id, world.bau, world.gvA.id);
  await mainSheet(p1.id, world.sao, world.gvA.id, 'PENDING');

  const p2 = await piece(world.gvA.id, 90, 'HIDDEN');
  world.p2 = p2.id;
  world.s2 = (await mainSheet(p2.id, world.tranh, world.gvA.id)).id;
  await mainSheet(p2.id, world.bau, world.gvA.id);
  world.p3 = (await piece(world.gvA.id, 90)).id;
  const p4 = await piece(world.gvA.id, 90);
  world.p4 = p4.id;
  await mainSheet(p4.id, world.tranh, world.gvA.id);
  await mainSheet(p4.id, world.bau, world.gvA.id);
  const p5 = await piece(world.gvA.id, 90);
  world.p5 = p5.id;
  await mainSheet(p5.id, world.tranh, world.gvA.id);

  const c1 = await classRecord(world.gvA.id, world.tranh, 0);
  world.c1 = c1.id;
  await member(c1.id, world.sv1.id, world.tranh);
  await member(c1.id, world.sv2.id, world.sao);
  const c2 = await classRecord(world.gvA.id, world.tranh, -120, 'ENDED');
  world.c2 = c2.id;
  await member(c2.id, world.sv1.id, world.tranh);
  const c3 = await classRecord(world.gvA.id, world.tranh, -1);
  world.c3 = c3.id;

  world.ae = await assignment(c1.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE', targetBpm: 72, maxSubmissions: 5 });
  world.as1 = await assignment(c1.id, world.s1, world.gvA.id, { kind: 'SOLO', maxSubmissions: 10 });
  world.aClosed = await assignment(c1.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE', status: 'CLOSED' });
  world.aPast = await assignment(c1.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE', deadlineDays: -1 });
  world.aNoBpm = await assignment(c1.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE', targetBpm: null });
  world.aUsed = await assignment(c1.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE', maxSubmissions: 1 });
  world.aDraft = await assignment(c1.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE', status: 'DRAFT' });
  world.a2 = await assignment(c1.id, world.s2, world.gvA.id, { kind: 'ENSEMBLE' });
  world.ax = await assignment(c3.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE' });
  world.aEnded = await assignment(c2.id, world.s1, world.gvA.id, { kind: 'ENSEMBLE' });
  const used = await prisma.assignment.findUniqueOrThrow({ where: { id: world.aUsed } });
  await prisma.submission.create({
    data: { assignmentId: world.aUsed, assignmentVersionId: used.currentVersionId, pieceId: world.p1, sheetMusicId: world.s1, studentId: world.sv1.id,
      status: 'COMPLETED', accuracy: 80, practiceMode: 'ENSEMBLE', result: { overallScore: 80 } }
  });
}

function tracks(pieceId: string, actor: Actor | null, assignmentId?: string) {
  const call = request(app).get(`${api}/pieces/${pieceId}/ensemble-tracks`).query(assignmentId ? { assignmentId } : {});
  return actor ? call.set(auth(actor)) : call;
}

function upload(actor: Actor | null, name: string, content: Buffer, contentType: string, fields: Record<string, string> = {}, field = 'file') {
  const call = request(app).post(`${api}/audio-uploads`);
  if (actor) call.set(auth(actor));
  for (const [key, value] of Object.entries(fields)) call.field(key, value);
  return content.length || name ? call.attach(field, content, { filename: name, contentType }) : call;
}

beforeAll(async () => {
  fs.rmSync('./storage-itc', { recursive: true, force: true });
  await seedWorld();
}, 120_000);

describe('Upload audio (POST /api/v1/audio-uploads)', () => {
  it('ITC-AD-001 uploading a valid WAV', async () => {
    const response = await upload(world.sv1, 'ban-thu.wav', ItcHarness.melodyWav(4), 'audio/wav');
    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Đã tải audio lên.');
    expect(response.body.data).toEqual({ fileId: expect.any(String), url: expect.any(String) });
  });

  it('ITC-AD-002 unsupported format, size limit, duration limits, several files, Guest', async () => {
    const fake = await upload(world.sv1, 'fake.wav', Buffer.from('this is plain text'), 'audio/wav');
    expect.soft([fake.status, fake.body.message], 'step 2 (MSG-13)').toEqual([400, MSG13]);
    const header = ItcHarness.melodyWav(4);
    const big = await upload(world.sv1, 'big.wav', Buffer.concat([header, Buffer.alloc(LIMITS.maxMb * 1024 * 1024 + 1 - header.length)]), 'audio/wav');
    expect.soft([big.status, big.body.message], 'step 3 (MSG-14)').toEqual([400, MSG14]);
    const long = await upload(world.sv1, 'long.wav', ItcHarness.melodyWav(LIMITS.maxSec + 1), 'audio/wav');
    expect.soft([long.status, long.body.message], 'step 4 (MSG-15)').toEqual([400, MSG15]);
    const short = await upload(world.sv1, 'short.wav', ItcHarness.melodyWav(LIMITS.minSec - 1), 'audio/wav');
    expect.soft([short.status, short.body.message], 'step 5 (MSG-15)').toEqual([400, MSG15]);
    const two = await request(app).post(`${api}/audio-uploads`).set(auth(world.sv1))
      .attach('file', ItcHarness.melodyWav(3), { filename: 'a.wav', contentType: 'audio/wav' })
      .attach('file', ItcHarness.melodyWav(3), { filename: 'b.wav', contentType: 'audio/wav' });
    expect.soft([two.status, two.body.message], 'step 6').toEqual([400, 'Không thể tải file lên. Vui lòng gửi đúng một file audio.']);
    const guest = await upload(null, 'ban-thu.wav', ItcHarness.melodyWav(3), 'audio/wav');
    expect.soft([guest.status, guest.body.message], 'step 7').toEqual([401, JWT_INVALID]);
  });

  it('ITC-AD-007 uploading an MP3 file and a direct recording', async () => {
    const mp3 = await upload(world.sv1, 'bai.mp3', ItcHarness.mp3(ItcHarness.melodyWav(4)), 'audio/mpeg');
    expect.soft([mp3.status, mp3.body.message], 'step 2').toEqual([201, 'Đã tải audio lên.']);
    const recording = ItcHarness.melodyWav(4, { leadingSilenceSec: 1.5, trailingSilenceSec: 2 });
    const response = await upload(world.sv1, 'thu-am.wav', recording, 'audio/wav', { source: 'recording' });
    expect(response.status).toBe(201);
    const saved = await prisma.audioUpload.findUniqueOrThrow({ where: { id: response.body.data.fileId } });
    const bytes = fs.readFileSync(path.join(EnvConfig.fileStorageLocalRoot, saved.key));
    expect.soft(ItcHarness.leadingSilenceSec(bytes), 'step 3: start kept').toBeGreaterThan(1.3);
    expect.soft(ItcHarness.durationSec(bytes), 'step 3: silent end cut').toBeLessThan(ItcHarness.durationSec(recording) - 1);
  });

  it('ITC-AD-008 no file, empty file, file in the wrong field', async () => {
    const none = await request(app).post(`${api}/audio-uploads`).set(auth(world.sv1)).field('source', 'file');
    expect.soft([none.status, none.body.message], 'step 2').toEqual([400, 'Vui lòng chọn một file audio.']);
    const empty = await upload(world.sv1, 'empty.wav', Buffer.alloc(0), 'audio/wav');
    expect.soft([empty.status, empty.body.message], 'step 3').toEqual([400, `File phải có dữ liệu và không vượt quá ${LIMITS.maxMb} MB.`]);
    const wrongField = await upload(world.sv1, 'ban-thu.wav', ItcHarness.melodyWav(3), 'audio/wav', {}, 'audio');
    expect.soft([wrongField.status, wrongField.body.message], 'step 4').toEqual([400, 'Không thể tải file lên. Vui lòng gửi đúng một file audio.']);
  });

  it('ITC-AD-009 extension or content not allowed, wrong source value', async () => {
    const ogg = await upload(world.sv1, 'bai.ogg', Buffer.from('OggS\0\u0002fake ogg payload'), 'audio/ogg');
    expect.soft([ogg.status, ogg.body.message], 'step 2 (MSG-13)').toEqual([400, MSG13]);
    const mismatch = await upload(world.sv1, 'bai.wav', ItcHarness.mp3(ItcHarness.melodyWav(3)), 'audio/wav');
    expect.soft([mismatch.status, mismatch.body.message], 'step 3 (MSG-13)').toEqual([400, MSG13]);
    const source = await upload(world.sv1, 'ban-thu.wav', ItcHarness.melodyWav(3), 'audio/wav', { source: 'abc' });
    expect.soft([source.status, source.body.field, source.body.message], 'step 4').toEqual([400, 'source', 'Kiểm tra lại dữ liệu gửi đi']);
  });

  it('ITC-AD-010 the file is saved, played by its owner and hidden from others', async () => {
    const created = await upload(world.sv1, 'ban-thu.wav', ItcHarness.melodyWav(3), 'audio/wav');
    expect(created.status).toBe(201);
    const filePath = new URL(created.body.data.url).pathname;
    const owner = await request(app).get(filePath).set(auth(world.sv1));
    expect.soft(owner.status, 'step 2').toBe(200);
    // Audio uploads are stored in audio_uploads (the TC names media_file): owner and content type are checked there.
    const row = await prisma.audioUpload.findUnique({ where: { id: created.body.data.fileId } });
    expect.soft([row?.ownerId, row?.contentType], 'step 3').toEqual([world.sv1.id, 'audio/wav']);
    const other = await request(app).get(filePath).set(auth(world.sv2));
    expect.soft([403, 404], 'step 4: another student').toContain(other.status);
    const guest = await request(app).get(filePath);
    expect.soft(guest.status, 'step 5: Guest').toBe(401);
  });
});

describe('Virtual ensemble (GET /api/v1/pieces/:pieceId/ensemble-tracks)', () => {
  const names = (body: { data: { tracks: Array<{ instrumentName: string }> } }) => body.data.tracks.map((track) => track.instrumentName).sort();

  it('ITC-AD-005 tracks without and with an ensemble assignment', async () => {
    const free = await tracks(world.p1, world.sv1);
    expect(free.status).toBe(200);
    // Round 1 decision: the API returns every part (the player mutes the student's own part while recording).
    expect.soft(names(free.body), 'step 2: every part is returned').toEqual(['Sáo trúc', 'Đàn bầu', 'Đàn tranh'].sort());
    // Decision (d): without assignmentId the take counts toward the open ensemble assignment $AE, as a submission would
    expect.soft([free.body.data.targetBpm, free.body.data.isAssignmentCounted, free.body.data.assignmentId], 'step 2').toEqual([72, true, world.ae]);
    expect.soft(free.body.data.mySheetMusicId, 'step 2').toBe(world.s1);
    const assigned = await tracks(world.p1, world.sv1, world.ae);
    expect.soft(assigned.status, 'step 3').toBe(200);
    expect.soft(names(assigned.body), 'step 3').toEqual(['Sáo trúc', 'Đàn bầu', 'Đàn tranh'].sort());
    expect.soft([assigned.body.data.targetBpm, assigned.body.data.isAssignmentCounted], 'step 3').toEqual([72, true]);
  });

  it('ITC-AD-006 no class, hidden piece, no tracks, only own track, lecturer', async () => {
    const noClass = await tracks(world.p1, world.sv9);
    expect.soft([noClass.status, noClass.body.message], 'step 2').toEqual([403, 'Bạn chưa thuộc lớp học nào nên chưa thể luyện hòa tấu.']);
    const hidden = await tracks(world.p2, world.sv1);
    expect.soft([hidden.status, hidden.body.message], 'step 3').toEqual([404, 'Không tìm thấy bài nhạc.']);
    const none = await tracks(world.p3, world.sv1);
    expect.soft([none.status, none.body.message], 'step 4').toEqual([404, NO_TRACKS]);
    const ownOnly = await tracks(world.p5, world.sv1);
    // Round 1 decision: a piece whose only track is the student's own part still opens with that track.
    expect.soft([ownOnly.status, names(ownOnly.body)], 'step 5').toEqual([200, ['Đàn tranh']]);
    const lecturer = await tracks(world.p1, world.gvA);
    expect.soft([lecturer.status, lecturer.body.message], 'step 6').toEqual([403, FORBIDDEN]);
  });

  it('ITC-AD-020 an assignment the student cannot use', async () => {
    for (const [label, pieceId, assignmentId] of [['step 2', world.p1, world.ax], ['step 3', world.p1, world.aDraft], ['step 4', world.p4, world.ae]] as const) {
      const response = await tracks(pieceId, world.sv1, assignmentId);
      expect.soft([response.status, response.body.message], label).toEqual([404, ASSIGNMENT_GONE]);
    }
  });

  it('ITC-AD-021 hidden piece through an assignment, not when hidden by Admin', async () => {
    const response = await tracks(world.p2, world.sv1, world.a2);
    expect.soft(response.status, 'step 2').toBe(200);
    expect.soft(response.body.data?.tracks?.length ?? 0, 'step 2').toBeGreaterThan(0);
    await prisma.piece.update({ where: { id: world.p2 }, data: { moderation: 'ADMIN_HIDDEN' } });
    const hidden = await tracks(world.p2, world.sv1, world.a2);
    expect.soft([hidden.status, hidden.body.message], 'step 3').toEqual([404, 'Không tìm thấy bài nhạc.']);
    await prisma.piece.update({ where: { id: world.p2 }, data: { moderation: 'NORMAL' } });
  });

  it('ITC-AD-022 which ensemble assignments are counted (GBR-25)', async () => {
    const counted = async (assignmentId: string) => (await tracks(world.p1, world.sv1, assignmentId)).body;
    const closed = await tracks(world.p1, world.sv1, world.aClosed);
    expect.soft([closed.status, closed.body.data?.isAssignmentCounted], 'step 2').toEqual([200, false]);
    expect.soft((await counted(world.aPast)).data?.isAssignmentCounted, 'step 3').toBe(false);
    expect.soft((await counted(world.as1)).data?.isAssignmentCounted, 'step 4').toBe(false);
    const noBpm = await counted(world.aNoBpm);
    expect.soft([noBpm.data?.targetBpm, noBpm.data?.isAssignmentCounted], 'step 5').toEqual([80, true]);
    expect.soft((await counted(world.aUsed)).data?.isAssignmentCounted, 'step 6 (attempts used up)').toBe(false);
    const ended = await tracks(world.p1, world.sv1, world.aEnded);
    expect.soft([ended.status, ended.body.data?.isAssignmentCounted], 'step 7 (class ended)').toEqual([200, false]);
  });

  it('ITC-AD-023 a student whose instrument has no sheet for the piece', async () => {
    const response = await tracks(world.p1, world.sv2);
    expect(response.status).toBe(200);
    expect.soft(response.body.data.mySheetMusicId).toBeNull();
    expect.soft(response.body.data.myInstrumentName).toBe('Sáo trúc');
    expect.soft(names(response.body), 'every part is returned').toEqual(['Sáo trúc', 'Đàn bầu', 'Đàn tranh'].sort());
    for (const track of response.body.data.tracks) {
      expect.soft(Object.keys(track).sort()).toEqual(['defaultVolume', 'durationSec', 'fileUrl', 'id', 'instrumentId', 'instrumentName', 'offsetMs']);
    }
  });

  it('ITC-AD-024 Guest and Admin', async () => {
    const guest = await tracks(world.p1, null);
    expect.soft([guest.status, guest.body.message], 'step 1').toEqual([401, JWT_INVALID]);
    const admin = await tracks(world.p1, world.admin);
    expect.soft([admin.status, admin.body.message], 'step 2').toEqual([403, FORBIDDEN]);
  });
});

describe('Rhythm callbacks to the BE', () => {
  const callbackPath = `${api}/internal/practice-submissions/progress`;

  async function processing(overrides: Record<string, unknown> = {}) {
    return prisma.submission.create({
      data: { pieceId: world.p1, sheetMusicId: world.s1, studentId: world.sv9.id, status: 'PROCESSING', evaluationId: randomUUID(), messageId: randomUUID(),
        publicationState: 'published', attempt: 1, stage: 'QUALITY_CHECK', ...overrides }
    });
  }

  const send = (body: Record<string, unknown>, secret: string | null = settings.callbackSecret, pathName = callbackPath) => {
    const call = request(app).post(pathName).send(body);
    return secret === null ? call : call.set('X-Callback-Secret', secret);
  };

  it('ITC-AD-025 the callback secret', async () => {
    const record = await processing();
    const body = { evaluationId: record.evaluationId, attempt: 1, job: 'quality_check', status: 'started' };
    const message = 'Callback secret không hợp lệ.';
    const none = await send(body, null);
    expect.soft([none.status, none.body.message], 'step 1').toEqual([401, message]);
    const wrong = await send(body, 'wrong-secret');
    expect.soft([wrong.status, wrong.body.message], 'step 2').toEqual([401, message]);
    const original = EnvConfig.aiCallbackSecret;
    Object.defineProperty(EnvConfig, 'aiCallbackSecret', { value: '' });
    try {
      const empty = await send(body, 'any-secret');
      expect.soft([empty.status, empty.body.message], 'step 3').toEqual([401, message]);
    } finally {
      Object.defineProperty(EnvConfig, 'aiCallbackSecret', { value: original });
    }
    const segment = await send(body, 'wrong-secret', `${api}/internal/practice-segments/progress`);
    expect.soft([segment.status, segment.body.message], 'step 4').toEqual([401, message]);
  });

  it('ITC-AD-026 the callback body is validated', async () => {
    const record = await processing();
    const base = { evaluationId: record.evaluationId, attempt: 1, job: 'quality_check', status: 'started' };
    const job = await send({ ...base, job: 'upload' });
    expect.soft([job.status, job.body.field], 'step 1').toEqual([400, 'job']);
    const attempt = await send({ ...base, attempt: 0 });
    expect.soft([attempt.status, attempt.body.field], 'step 2').toEqual([400, 'attempt']);
    const noResult = await send({ ...base, job: 'feedback', status: 'done' });
    expect.soft(noResult.status, 'step 3').toBe(400);
    expect.soft(JSON.stringify(noResult.body), 'step 3').toContain('Thiếu kết quả phân tích.');
    const score = await send({ ...base, job: 'feedback', status: 'done', result: { overallScore: 120, pitchAccuracyPercent: 80, rhythmAccuracyPercent: 80, aiFeedback: 'x' } });
    expect.soft(score.status, 'step 4').toBe(400);
  });

  it('ITC-AD-027 an old or unknown callback is ignored', async () => {
    const onAttempt2 = await processing({ attempt: 2 });
    const completed = await processing({ status: 'COMPLETED', accuracy: 75 });
    const unknown = await send({ evaluationId: randomUUID(), attempt: 1, job: 'quality_check', status: 'started' });
    expect.soft([unknown.status, unknown.body.data?.isApplied], 'step 1').toEqual([200, false]);
    const old = await send({ evaluationId: onAttempt2.evaluationId, attempt: 1, job: 'comparison', status: 'started' });
    expect.soft([old.status, old.body.data?.isApplied], 'step 2').toEqual([200, false]);
    const late = await send({ evaluationId: completed.evaluationId, attempt: 1, job: 'quality_check', status: 'failed' });
    expect.soft([late.status, late.body.data?.isApplied], 'step 3').toEqual([200, false]);
    const after = await prisma.submission.findMany({ where: { id: { in: [onAttempt2.id, completed.id] } }, orderBy: { createdAt: 'asc' } });
    expect.soft(after.map((item) => [item.status, item.stage]), 'not changed').toEqual([['PROCESSING', 'QUALITY_CHECK'], ['COMPLETED', 'QUALITY_CHECK']]);
  });

  it('ITC-AD-028 rejected and failed callbacks without a reason', async () => {
    const first = await processing();
    const second = await processing();
    const rejected = await send({ evaluationId: first.evaluationId, attempt: 1, job: 'quality_check', status: 'rejected' });
    expect.soft([rejected.status, rejected.body.data?.isApplied], 'step 1').toEqual([200, true]);
    const failed = await send({ evaluationId: second.evaluationId, attempt: 1, job: 'comparison', status: 'failed' });
    expect.soft([failed.status, failed.body.data?.isApplied], 'step 2').toEqual([200, true]);
    const one = await prisma.submission.findUniqueOrThrow({ where: { id: first.id } });
    const two = await prisma.submission.findUniqueOrThrow({ where: { id: second.id } });
    expect.soft([one.status, one.rejectReason], 'step 3: first').toEqual(['REJECTED', 'Bản thu không đạt chất lượng.']);
    expect.soft([two.status, two.errorCode, two.errorMessage], 'step 3: second').toEqual(['FAILED', 'EVALUATION_FAILED', 'Xử lý bản thu thất bại.']);
  });
});

describe('Flows with the real Rhythm service', () => {
  let server: http.Server | null = null;

  async function studentUpload(actor: Actor, seconds = 6): Promise<string> {
    const response = await upload(actor, 'ban-thu.wav', ItcHarness.melodyWav(seconds, { gain: 0.45 }), 'audio/wav');
    if (response.status !== 201) throw new Error(`upload failed: ${JSON.stringify(response.body)}`);
    return response.body.data.fileId;
  }

  async function submit(actor: Actor, body: Record<string, unknown>) {
    return request(app).post(`${api}/practice/submissions`).set(auth(actor)).send(body);
  }

  async function waitStatus(actor: Actor, id: string, statuses: string[], timeoutMs = 240_000) {
    return ItcHarness.waitFor(async () => {
      const response = await request(app).get(`${api}/practice/submissions/${id}`).set(auth(actor));
      return statuses.includes(response.body.data?.status) ? response.body.data : null;
    }, timeoutMs, `submission ${id} to be ${statuses.join('/')}`, 1000);
  }

  beforeAll(async () => {
    server = await ItcHarness.listen(app, settings.bePort);
    await harness.startGemini();
    await harness.startRhythm();
    await harness.purgeQueues();
  }, 240_000);

  afterAll(async () => {
    await harness.stopRhythm();
    await harness.stopGemini();
    await ItcHarness.close(server);
  }, 60_000);

  it('ITC-AD-029 full flow from a student take to the score', async () => {
    const created = await submit(world.sv1, { sheetMusicId: world.s1, studentUploadId: await studentUpload(world.sv1) });
    expect(created.status).toBe(202);
    const done = await waitStatus(world.sv1, created.body.data.id, ['COMPLETED', 'FAILED', 'REJECTED']);
    expect(done.status).toBe('COMPLETED');
    const record = await prisma.submission.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const remote = await harness.rhythmGet(`/api/v1/evaluations/${record.evaluationId}`);
    const remoteResult = (remote.body as { result: Record<string, number> }).result;
    const localResult = record.result as Record<string, number>;
    for (const key of ['overallScore', 'pitchAccuracyPercent', 'rhythmAccuracyPercent']) expect.soft(localResult[key], key).toBe(remoteResult[key]);
    expect.soft(record.aiFeedback, 'aiFeedback').toBeTruthy();
  }, 300_000);

  it('ITC-AD-030 the template analysis is used when the student practises', async () => {
    const fileId = await TestContext.upload(world.gvA, 'AUDIO', 'mau-moi.wav', 'audio/wav', ItcHarness.melodyWav(6));
    const replaced = await request(app).put(`${api}/lecturer/sheet-music/${world.s1}/files/audio`).set(auth(world.gvA)).send({ fileId });
    expect(replaced.status).toBe(200);
    const sheet = await ItcHarness.waitFor(async () => {
      const row = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: world.s1 } });
      return row.analysisStatus === 'READY' || row.analysisStatus === 'ERROR' ? row : null;
    }, 180_000, 'template analysis of S1', 2000);
    expect(sheet.analysisStatus).toBe('READY');
    await harness.stopRhythm();
    const created = await submit(world.sv1, { sheetMusicId: world.s1, studentUploadId: await studentUpload(world.sv1) });
    expect(created.status).toBe(202);
    const job = await harness.peekJob();
    expect.soft(job?.templateAnalysisId, 'step 3: job').toBe(sheet.analysisJobId);
    await harness.startRhythm();
    await waitStatus(world.sv1, created.body.data.id, ['COMPLETED', 'FAILED', 'REJECTED']);
    const record = await prisma.submission.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const artifact = await harness.rhythmGet(`/api/v1/evaluations/${record.evaluationId}/analysis`);
    expect.soft((artifact.body as { templateAnalysisId?: string } | null)?.templateAnalysisId, 'step 3: pitch data file').toBe(sheet.analysisJobId);
  }, 420_000);

  it('ITC-AD-031 the BE gets the result from Rhythm when the callback is lost (GBR-65)', async () => {
    await harness.stopRhythm();
    const created = await submit(world.sv1, { sheetMusicId: world.s1, studentUploadId: await studentUpload(world.sv1) });
    expect(created.status).toBe(202);
    await harness.startRhythm({ RHYTHM_SERVICE_CALLBACK_ALLOWED_HOSTS: 'be.local' });
    const record = await prisma.submission.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const remote = await ItcHarness.waitFor(async () => {
      const response = await harness.rhythmGet(`/api/v1/evaluations/${record.evaluationId}`);
      return (response.body as { status?: string } | null)?.status === 'completed' ? response.body as { result: Record<string, unknown> } : null;
    }, 240_000, 'Rhythm evaluation', 1000);
    const local = await waitStatus(world.sv1, created.body.data.id, ['COMPLETED', 'FAILED'], 60_000);
    expect.soft(local.status, 'step 4').toBe('COMPLETED');
    const saved = await prisma.submission.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect.soft((saved.result as Record<string, unknown>)?.overallScore, 'scores').toBe(remote.result.overallScore);
    expect.soft(saved.aiFeedback, 'aiFeedback').toBe(remote.result.aiFeedback);
    await harness.startRhythm();
  }, 420_000);

  it('ITC-AD-032 retry at most 3 times, then download and remove the file (GBR-59..62)', async () => {
    ItcHarness.geminiMode = '503';
    try {
      const contextBefore = await request(app).get(`${api}/practice/context`).query({ sheetMusicId: world.s1, assignmentId: world.as1 }).set(auth(world.sv1));
      const usedBefore = contextBefore.body.data?.assignment?.usedSubmissions;
      const uploadId = await studentUpload(world.sv1);
      const created = await submit(world.sv1, { sheetMusicId: world.s1, assignmentId: world.as1, studentUploadId: uploadId });
      expect(created.status).toBe(202);
      const id = created.body.data.id as string;
      await waitStatus(world.sv1, id, ['FAILED']);
      for (const expectedCount of [1, 2, 3]) {
        const current = await prisma.submission.findUniqueOrThrow({ where: { id } });
        if (current.retryAvailableAt) await new Promise((resolve) => setTimeout(resolve, Math.max(0, current.retryAvailableAt!.getTime() - Date.now()) + 300));
        const retry = await request(app).post(`${api}/practice/submissions/${id}/retry`).set(auth(world.sv1));
        expect.soft([retry.status, retry.body.message, retry.body.data?.retryCount], `step 3: retry ${expectedCount}`).toEqual([202, 'Đang xử lý lại bản thu...', expectedCount]);
        await waitStatus(world.sv1, id, ['FAILED']);
      }
      const fourth = await request(app).post(`${api}/practice/submissions/${id}/retry`).set(auth(world.sv1));
      expect.soft(fourth.status, 'step 4').toBe(409);
      const final = await request(app).get(`${api}/practice/submissions/${id}`).set(auth(world.sv1));
      expect.soft(final.body.data?.status, 'step 5').toBe('FAILED');
      // Round 1 decision: after the last retry the student sees the error of that attempt.
      expect.soft(final.body.data?.errorMessage, 'step 5').toBe('Chưa thể tạo nhận xét AI. Vui lòng thử lại.');
      const row = await prisma.submission.findUniqueOrThrow({ where: { id } });
      expect.soft([row.status, row.retryCount], 'step 6').toEqual(['FAILED', 3]);
      const stored = await prisma.audioUpload.findUnique({ where: { id: uploadId } });
      const exists = stored ? fs.existsSync(path.join(EnvConfig.fileStorageLocalRoot, stored.key)) : false;
      expect.soft(exists, 'step 6: file removed from storage (GBR-62)').toBe(false);
      const contextAfter = await request(app).get(`${api}/practice/context`).query({ sheetMusicId: world.s1, assignmentId: world.as1 }).set(auth(world.sv1));
      expect.soft(contextAfter.body.data?.assignment?.usedSubmissions, 'step 6: not counted (GBR-61)').toBe(usedBefore);
    } finally {
      ItcHarness.geminiMode = 'ok';
    }
  }, 600_000);

  it('ITC-AD-033 an ensemble take counts toward the open ensemble assignment until it has no attempts left', async () => {
    const send = async (assignmentId?: string) => submit(world.sv1, {
      sheetMusicId: world.s1, practiceMode: 'ENSEMBLE', studentUploadId: await studentUpload(world.sv1), ...(assignmentId ? { assignmentId } : {})
    });
    const step2 = await send(world.ae);
    expect.soft([step2.status, step2.body.data?.status, step2.body.data?.assignmentId], 'step 2').toEqual([202, 'PROCESSING', world.ae]);
    expect.soft((await waitStatus(world.sv1, step2.body.data.id, ['COMPLETED', 'FAILED', 'REJECTED'])).status, 'step 2').toBe('COMPLETED');
    const step3 = await send(world.as1);
    expect.soft([step3.status, step3.body.data?.assignmentId], 'step 3: SOLO assignment named, counted toward $AE').toEqual([202, world.ae]);
    await waitStatus(world.sv1, step3.body.data.id, ['COMPLETED', 'FAILED', 'REJECTED']);
    const step4 = await send();
    expect.soft([step4.status, step4.body.data?.assignmentId], 'step 4: no assignment named, counted toward $AE').toEqual([202, world.ae]);
    await waitStatus(world.sv1, step4.body.data.id, ['COMPLETED', 'FAILED', 'REJECTED']);
    const history = await request(app).get(`${api}/practice/submissions`).query({ kinds: 'ENSEMBLE', limit: 50 }).set(auth(world.sv1));
    expect.soft(history.status, 'step 5').toBe(200);
    const ids = [step2.body.data.id, step3.body.data.id, step4.body.data.id];
    const items = (history.body.data?.items ?? []) as Array<{ id: string; assignmentId: string | null }>;
    const mine = items.filter((item) => ids.includes(item.id));
    expect.soft(mine.length, 'step 5: the 3 ensemble takes').toBe(3);
    expect.soft(mine.every((item) => item.assignmentId === world.ae), 'step 5: all 3 linked to $AE').toBe(true);
    // Step 6: $AE has no attempts left and no other ensemble assignment is open, so the next take is free practice
    await prisma.assignment.update({ where: { id: world.ae }, data: { maxSubmissions: 3 } });
    await prisma.assignment.update({ where: { id: world.aNoBpm }, data: { status: 'CLOSED' } });
    const step6 = await send();
    expect.soft([step6.status, step6.body.data?.assignmentId], 'step 6: free practice').toEqual([202, null]);
    await waitStatus(world.sv1, step6.body.data.id, ['COMPLETED', 'FAILED', 'REJECTED']);
  }, 900_000);

  it('ITC-RT-018 analysis status of a main sheet blocks practice until ready (UC-05.5, GBR-48)', async () => {
    const p6 = await piece(world.gvA.id, 80);
    const s4Response = await TestContext.createSheet(world.gvA, p6.id, { name: 'Bản chính', instrumentId: world.tranh, visibility: 'HIDDEN' });
    expect(s4Response.status, JSON.stringify(s4Response.body)).toBe(201);
    const s4 = s4Response.body.data.id as string;
    await prisma.sheetMusic.update({ where: { id: s4 }, data: { kind: 'MAIN', mainInstrumentId: world.tranh, visibility: 'PUBLIC' } });
    const status = async () => {
      const response = await request(app).get(`${api}/lecturer/sheet-music/${s4}`).set(auth(world.gvA));
      const analysis = response.body.data?.analysis ?? response.body.data?.sheetMusic?.analysis;
      return { label: ANALYSIS_LABELS[analysis?.status] ?? analysis?.status, error: analysis?.error };
    };
    const practice = async () => (await request(app).get(`${api}/practice/context`).query({ sheetMusicId: s4 }).set(auth(world.sv1))).body.data?.sheet?.practice;

    await harness.stopRhythm();
    const fileId = await TestContext.upload(world.gvA, 'AUDIO', 'mau.wav', 'audio/wav', ItcHarness.melodyWav(6));
    const put = await request(app).put(`${api}/lecturer/sheet-music/${s4}/files/audio`).set(auth(world.gvA)).send({ fileId });
    expect(put.status).toBe(200);
    expect.soft((await status()).label, 'step 2').toBe('Đang chuẩn bị');
    expect.soft(await practice(), 'step 3').toEqual({ isAvailable: false, reason: 'Bản nhạc đang được chuẩn bị, vui lòng quay lại sau.' });

    await harness.startRhythm();
    await ItcHarness.waitFor(async () => (await status()).label !== 'Đang chuẩn bị', 180_000, 'analysis of S4', 2000);
    expect.soft((await status()).label, 'step 4: lecturer').toBe('Sẵn sàng');
    expect.soft((await practice())?.isAvailable, 'step 4: student').toBe(true);

    const silentWav = ItcHarness.melodyWav(6, { gain: 0 });
    const silentId = await TestContext.upload(world.gvA, 'AUDIO', 'im-lang.wav', 'audio/wav', silentWav);
    const replaced = await request(app).put(`${api}/lecturer/sheet-music/${s4}/files/audio`).set(auth(world.gvA)).send({ fileId: silentId });
    expect.soft(replaced.status, 'step 5: replace').toBe(200);
    await ItcHarness.waitFor(async () => (await status()).label !== 'Đang chuẩn bị', 180_000, 'analysis of the silent recording', 2000);
    const after = await status();
    expect.soft([after.label, after.error], 'step 5').toEqual(['Lỗi phân tích', 'Bản thu hoàn toàn im lặng. Vui lòng thu âm lại.']);
  }, 600_000);
});
