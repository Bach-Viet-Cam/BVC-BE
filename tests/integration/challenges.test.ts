import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const base = '/api/v1/lecturer/challenges';

describe('Weekly challenges (lecturer)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let token: string;
  let tranh: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;
  let classA: Awaited<ReturnType<typeof TestDatabase.createClass>>;
  let readyPiece: Awaited<ReturnType<typeof TestDatabase.createPiece>>;

  const currentMonday = (): string => DateTimeUtil.startOfWeekInVietnam(DateTimeUtil.todayInVietnam());
  const monday = (weeks: number): string => DateTimeUtil.addDays(currentMonday(), weeks * 7);

  async function createReadyPiece(instrumentId: string, overrides: { audio?: boolean; analysis?: 'NONE' | 'READY' } = {}) {
    const piece = await TestDatabase.createPiece(instrumentId);
    const uploader = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    const level = await TestDatabase.prisma.category.findFirstOrThrow({ where: { type: 'LEVEL' } });
    const sequence = TestDatabase.nextId();
    const makeFile = (kind: 'SHEET' | 'AUDIO', suffix: string) =>
      TestDatabase.prisma.mediaFile.create({
        data: { kind, status: 'READY', storageKey: `test/${sequence}-${suffix}`, originalName: suffix, mimeType: 'application/octet-stream', sizeBytes: 10, uploadedById: uploader.id }
      });
    const sheetFile = await makeFile('SHEET', 'sheet.pdf');
    const audio = overrides.audio === false ? null : await makeFile('AUDIO', 'ref.wav');
    const sheet = await TestDatabase.prisma.sheetMusic.create({
      data: {
        pieceId: piece.id,
        instrumentId,
        kind: 'MAIN',
        mainInstrumentId: instrumentId,
        name: 'Bản chính',
        levelId: level.id,
        sheetFileId: sheetFile.id,
        referenceAudioId: audio?.id ?? null,
        analysisStatus: overrides.analysis ?? 'READY',
        uploaderId: uploader.id
      }
    });
    return { piece, sheet };
  }

  async function classWithStudent(instrumentId: string = tranh.id, owner: { id: string } = lecturer, overrides: Parameters<typeof TestDatabase.createClass>[2] = {}) {
    const record = await TestDatabase.createClass(owner.id, instrumentId, overrides);
    await TestDatabase.addMember(record.id, (await TestDatabase.createUser()).id, owner.id);
    return record;
  }

  const post = (body: object, auth: string = token) => request(app).post(base).set('Authorization', auth).send(body);
  const publishBody = (overrides: object = {}) => ({
    title: 'Thử thách tuần',
    instrumentId: tranh.id,
    pieceId: readyPiece.id,
    classIds: [classA.id],
    weekStart: monday(1),
    publish: true,
    ...overrides
  });

  beforeEach(async () => {
    await TestDatabase.reset();
    lecturer = await TestDatabase.createLecturer();
    token = TestDatabase.tokenFor(lecturer);
    tranh = await TestDatabase.createInstrument('Đàn tranh');
    classA = await classWithStudent();
    readyPiece = (await createReadyPiece(tranh.id)).piece;
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  describe('authentication and roles', () => {
    const someId = '00000000-0000-4000-8000-000000000001';
    const routes: Array<[string, string]> = [
      ['get', base],
      ['get', `${base}/form-meta`],
      ['get', `${base}/pieces`],
      ['get', `${base}/${someId}`],
      ['post', base],
      ['patch', `${base}/${someId}`],
      ['delete', `${base}/${someId}`],
      ['post', `${base}/${someId}/publish`]
    ];

    it('returns 401 without a token on every route', async () => {
      for (const [method, url] of routes) {
        const response = await (request(app) as unknown as Record<string, (path: string) => request.Test>)[method](url).send({ title: 'x' });
        expect(response.status, `${method} ${url}`).toBe(401);
      }
    });

    it('returns 403 for students and system admins on every route', async () => {
      const student = TestDatabase.tokenFor(await TestDatabase.createUser());
      const admin = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN }));
      for (const auth of [student, admin]) {
        for (const [method, url] of routes) {
          const response = await (request(app) as unknown as Record<string, (path: string) => request.Test>)[method](url).set('Authorization', auth).send({ title: 'x' });
          expect(response.status, `${method} ${url}`).toBe(403);
        }
      }
    });
  });

  describe('create draft', () => {
    it('creates a draft with a title only', async () => {
      const response = await post({ title: '  Thử thách nháp  ', publish: false });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Tạo thử thách thành công.');
      expect(response.body.data).toMatchObject({ status: 'DRAFT', displayStatus: 'DRAFT', title: 'Thử thách nháp', startsAt: null, endsAt: null, instrument: null, piece: null, classes: [], maxSubmissions: 3 });
      const stored = await TestDatabase.prisma.challenge.findUniqueOrThrow({ where: { id: response.body.data.id } });
      expect(stored.startsAt).toBeNull();
    });

    it('defaults publish to false and requires a title', async () => {
      expect((await post({ title: 'Nháp' })).body.data.status).toBe('DRAFT');
      const response = await post({ description: 'không có tiêu đề' });
      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'title', code: 'MSG-35' })]));
    });

    it('rejects a non-Monday week start and a past week', async () => {
      const notMonday = await post({ title: 'x', weekStart: DateTimeUtil.addDays(monday(1), 1) });
      expect(notMonday.status).toBe(400);
      expect(notMonday.body.errors[0].field).toBe('weekStart');
      const past = await post({ title: 'x', weekStart: monday(-1) });
      expect(past.status).toBe(400);
      expect(past.body.code).toBe('MSG-04');
    });

    it('still checks class ownership and instrument match on drafts', async () => {
      const other = await TestDatabase.createLecturer();
      const foreign = await classWithStudent(tranh.id, other);
      expect((await post({ title: 'x', classIds: [foreign.id] })).status).toBe(404);
      const sao = await TestDatabase.createInstrument('Sáo');
      const mismatch = await post({ title: 'x', instrumentId: sao.id, classIds: [classA.id] });
      expect(mismatch.status).toBe(400);
      expect(mismatch.body.errors[0].field).toBe('classIds');
      const pieceMismatch = await post({ title: 'x', instrumentId: sao.id, pieceId: readyPiece.id });
      expect(pieceMismatch.status).toBe(400);
      expect(pieceMismatch.body.errors[0]).toMatchObject({ field: 'pieceId', code: 'MSG-48' });
    });
  });

  describe('publish', () => {
    it('creates and publishes in one request with the selected week bounds', async () => {
      const response = await post(publishBody());
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Đăng thử thách thành công.');
      const { data } = response.body;
      expect(data.status).toBe('PUBLISHED');
      expect(data.displayStatus).toBe('UPCOMING');
      expect(data.startsAt).toBe(DateTimeUtil.startOfDayInVietnam(monday(1)).toISOString());
      expect(data.endsAt).toBe(new Date(DateTimeUtil.startOfDayInVietnam(monday(2)).getTime() - 1).toISOString());
      expect(data.publishedAt).toBeTruthy();
      const logs = await TestDatabase.prisma.auditLog.findMany({ where: { action: 'CHALLENGE_PUBLISH' } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ entityId: data.id, actorId: lecturer.id });
    });

    it('publishes the current week immediately as ACTIVE', async () => {
      const response = await post(publishBody({ weekStart: currentMonday() }));
      expect(response.status).toBe(201);
      expect(response.body.data.displayStatus).toBe('ACTIVE');
      expect(new Date(response.body.data.startsAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('publishes an existing draft through the publish endpoint', async () => {
      const draft = await post(publishBody({ publish: false }));
      expect(draft.body.data.status).toBe('DRAFT');
      const response = await request(app).post(`${base}/${draft.body.data.id}/publish`).set('Authorization', token);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('PUBLISHED');
      expect(response.body.data.startsAt).toBe(DateTimeUtil.startOfDayInVietnam(monday(1)).toISOString());
      const again = await request(app).post(`${base}/${draft.body.data.id}/publish`).set('Authorization', token);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('MSG-08');
    });

    it('lists every missing field and persists nothing', async () => {
      const response = await post({ title: 'Thiếu dữ liệu', publish: true });
      expect(response.status).toBe(400);
      const errors = response.body.errors as Array<{ field: string; code: string }>;
      expect(errors.map((error) => error.field).sort()).toEqual(['classIds', 'instrumentId', 'pieceId', 'weekMonday'].sort());
      expect(errors.every((error) => error.code === 'MSG-35')).toBe(true);
      expect(await TestDatabase.prisma.challenge.count()).toBe(0);
    });

    it('rejects a piece without reference audio or finished analysis with MSG-48', async () => {
      const noAudio = (await createReadyPiece(tranh.id, { audio: false })).piece;
      const notAnalysed = (await createReadyPiece(tranh.id, { analysis: 'NONE' })).piece;
      for (const piece of [noAudio, notAnalysed]) {
        const response = await post(publishBody({ pieceId: piece.id }));
        expect(response.status).toBe(400);
        expect(response.body.errors[0]).toMatchObject({ field: 'pieceId', code: 'MSG-48' });
      }
      expect(await TestDatabase.prisma.challenge.count()).toBe(0);
    });

    it('rejects a past week with MSG-04 and a non-Monday with 400', async () => {
      const past = await post(publishBody({ weekStart: monday(-1) }));
      expect(past.status).toBe(400);
      expect(past.body.code).toBe('MSG-04');
      expect((await post(publishBody({ weekStart: DateTimeUtil.addDays(monday(1), 2) }))).status).toBe(400);
    });

    it('hides classes of other lecturers (404) and rejects ended or empty classes (409)', async () => {
      const other = await TestDatabase.createLecturer();
      const foreign = await classWithStudent(tranh.id, other);
      expect((await post(publishBody({ classIds: [foreign.id] }))).status).toBe(404);
      const ended = await classWithStudent(tranh.id, lecturer, { status: 'ENDED' });
      const endedResponse = await post(publishBody({ classIds: [ended.id] }));
      expect(endedResponse.status).toBe(409);
      expect(endedResponse.body.code).toBe('MSG-08');
      const empty = await TestDatabase.createClass(lecturer.id, tranh.id);
      const emptyResponse = await post(publishBody({ classIds: [empty.id] }));
      expect(emptyResponse.status).toBe(409);
      expect(emptyResponse.body.code).toBe('MSG-08');
    });

    it('rejects a class whose instrument differs from the challenge instrument', async () => {
      const sao = await TestDatabase.createInstrument('Sáo');
      const saoPiece = (await createReadyPiece(sao.id)).piece;
      const response = await post(publishBody({ instrumentId: sao.id, pieceId: saoPiece.id }));
      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('classIds');
    });

    it('blocks an overlapping challenge for the same instrument, week and class only', async () => {
      expect((await post(publishBody())).status).toBe(201);
      const sameClass = await post(publishBody({ title: 'Trùng lớp' }));
      expect(sameClass.status).toBe(409);
      expect(sameClass.body.code).toBe('MSG-08');
      expect((await post(publishBody({ weekStart: monday(2) }))).status).toBe(201);
      const classB = await classWithStudent();
      expect((await post(publishBody({ classIds: [classB.id] }))).status).toBe(201);
      expect(await TestDatabase.prisma.challenge.count({ where: { status: 'PUBLISHED' } })).toBe(3);
    });

    it('notifies deduplicated active members of all selected classes', async () => {
      const classB = await TestDatabase.createClass(lecturer.id, tranh.id);
      const shared = await TestDatabase.createUser();
      const onlyB = await TestDatabase.createUser();
      await TestDatabase.addMember(classB.id, shared.id, lecturer.id);
      await TestDatabase.addMember(classB.id, onlyB.id, lecturer.id);
      const classAMember = await TestDatabase.prisma.classMember.findFirstOrThrow({ where: { classId: classA.id } });
      await TestDatabase.prisma.classMember.update({ where: { id: classAMember.id }, data: { userId: shared.id } });
      const response = await post(publishBody({ classIds: [classA.id, classB.id] }));
      expect(response.status).toBe(201);
      const deliveries = await TestDatabase.prisma.userNotification.findMany({ include: { notification: true } });
      expect(deliveries.map((item) => item.userId).sort()).toEqual([shared.id, onlyB.id].sort());
      expect(deliveries[0].notification).toMatchObject({ title: 'Thử thách mới', link: `/challenge/${response.body.data.id}` });
    });
  });

  describe('read, update and delete', () => {
    it('returns 404 for another lecturer on get, patch, delete and publish', async () => {
      const draft = (await post({ title: 'Của tôi' })).body.data;
      const other = TestDatabase.tokenFor(await TestDatabase.createLecturer());
      const url = `${base}/${draft.id}`;
      expect((await request(app).get(url).set('Authorization', other)).status).toBe(404);
      expect((await request(app).patch(url).set('Authorization', other).send({ title: 'x' })).status).toBe(404);
      expect((await request(app).delete(url).set('Authorization', other)).status).toBe(404);
      expect((await request(app).post(`${url}/publish`).set('Authorization', other)).status).toBe(404);
      expect((await request(app).get(url).set('Authorization', token)).status).toBe(200);
    });

    it('updates and deletes drafts', async () => {
      const draft = (await post({ title: 'Nháp' })).body.data;
      const url = `${base}/${draft.id}`;
      const patched = await request(app).patch(url).set('Authorization', token).send({ title: 'Đã sửa', classIds: [classA.id], instrumentId: tranh.id, weekStart: monday(1) });
      expect(patched.status).toBe(200);
      expect(patched.body.data).toMatchObject({ title: 'Đã sửa', weekStart: monday(1) });
      expect(patched.body.data.classes.map((item: { id: string }) => item.id)).toEqual([classA.id]);
      const cleared = await request(app).patch(url).set('Authorization', token).send({ classIds: [] });
      expect(cleared.body.data.classes).toEqual([]);
      expect(cleared.body.data.title).toBe('Đã sửa');
      expect((await request(app).delete(url).set('Authorization', token)).status).toBe(200);
      expect(await TestDatabase.prisma.challenge.count()).toBe(0);
      expect((await request(app).get(url).set('Authorization', token)).status).toBe(404);
    });

    it('rejects PATCH and DELETE on a published challenge with 409 MSG-08', async () => {
      const published = (await post(publishBody())).body.data;
      const url = `${base}/${published.id}`;
      const patch = await request(app).patch(url).set('Authorization', token).send({ title: 'x' });
      expect(patch.status).toBe(409);
      expect(patch.body.code).toBe('MSG-08');
      const remove = await request(app).delete(url).set('Authorization', token);
      expect(remove.status).toBe(409);
      expect(remove.body.code).toBe('MSG-08');
    });
  });

  describe('list and helpers', () => {
    it('returns an empty list', async () => {
      const response = await request(app).get(base).set('Authorization', token);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.pagination).toMatchObject({ page: 1, total: 0 });
    });

    it('lists own challenges only, with display status', async () => {
      await post({ title: 'Nháp của tôi' });
      await post(publishBody({ title: 'Sắp tới' }));
      await post(publishBody({ title: 'Đang diễn ra', weekStart: currentMonday(), classIds: [(await classWithStudent()).id] }));
      const other = await TestDatabase.createLecturer();
      await request(app).post(base).set('Authorization', TestDatabase.tokenFor(other)).send({ title: 'Của người khác' });
      const response = await request(app).get(`${base}?page=1&limit=10`).set('Authorization', token);
      expect(response.status).toBe(200);
      const byTitle = Object.fromEntries(response.body.data.items.map((item: { title: string; displayStatus: string }) => [item.title, item.displayStatus]));
      expect(byTitle).toEqual({ 'Nháp của tôi': 'DRAFT', 'Sắp tới': 'UPCOMING', 'Đang diễn ra': 'ACTIVE' });
      expect(response.body.data.pagination.total).toBe(3);
      const published = response.body.data.items.find((item: { title: string }) => item.title === 'Sắp tới');
      expect(published).toMatchObject({ instrument: { id: tranh.id }, piece: { id: readyPiece.id }, weekStart: monday(1) });
      expect(published.classes).toHaveLength(1);
    });

    it('returns form defaults', async () => {
      const response = await request(app).get(`${base}/form-meta`).set('Authorization', token);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ defaultMinAccuracy: 70, maxSubmissionsDefault: 3 });
    });

    it('lists only ready pieces, filtered by instrument and search', async () => {
      await createReadyPiece(tranh.id, { audio: false });
      await createReadyPiece(tranh.id, { analysis: 'NONE' });
      const sao = await TestDatabase.createInstrument('Sáo');
      await createReadyPiece(sao.id);
      const response = await request(app).get(`${base}/pieces?instrumentId=${tranh.id}`).set('Authorization', token);
      expect(response.status).toBe(200);
      expect(response.body.data.items.map((item: { id: string }) => item.id)).toEqual([readyPiece.id]);
      const search = await request(app).get(`${base}/pieces?instrumentId=${tranh.id}&q=khong-co-bai-nay`).set('Authorization', token);
      expect(search.body.data.items).toEqual([]);
    });
  });
});
