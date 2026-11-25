import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import F from './PracticeCommunityFixture.ts';
import TestDatabase from './TestDatabase.ts';

type TestUser = Awaited<ReturnType<typeof TestDatabase.createUser>>;

const base = '/lecturer/challenges';
const weekStart = '2030-01-07';

describe('Report 5.2 – Weekly Challenges (UC-18)', () => {
  let gvA: TestUser;
  let gvB: TestUser;
  let sv1: TestUser;
  let sv2: TestUser;
  let tranhId: string;
  let c1: string;
  let c2: string;
  let p1: string;

  // GV-A teaches $C1 (SV-1) and $C2 (SV-2); song $P1 has a ready Đàn tranh main sheet
  beforeEach(async () => {
    await TestDatabase.reset();
    gvA = await F.teacher('GV-A');
    gvB = await F.teacher('GV-B');
    sv1 = await F.student('SV-1');
    sv2 = await F.student('SV-2');
    tranhId = (await TestDatabase.createInstrument('Đàn tranh')).id;
    c1 = await createClass('Lớp C1', sv1);
    c2 = await createClass('Lớp C2', sv2);
    p1 = await createReadySong('Lưu thủy');
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  async function createClass(name: string, student: TestUser | null, instrumentId: string = tranhId): Promise<string> {
    const { id } = await TestDatabase.createClass(gvA.id, instrumentId, { name });
    if (student) await TestDatabase.addMember(id, student.id, gvA.id);
    return id;
  }

  async function createReadySong(title: string, instrumentId: string = tranhId): Promise<string> {
    const { id } = await F.createSong(instrumentId, title);
    await F.createSheet(id, instrumentId);
    return id;
  }

  const create = (body: object, user: TestUser = gvA) => F.post(base, body, user);
  const publishBody = (overrides: object = {}) => ({
    title: 'T', instrumentId: tranhId, pieceId: p1, classIds: [c1], weekStart, publish: true, ...overrides
  });

  // $CH1: the challenge published in ITC-CH-001
  async function publishedChallenge(): Promise<string> {
    const response = await create(publishBody({ title: 'Thử thách Lưu thủy', classIds: [c1, c2] }));
    if (response.status !== 201) throw new Error(`publish challenge failed: ${JSON.stringify(response.body)}`);
    return response.body.data.id as string;
  }

  describe('Create, edit, publish and delete (POST /lecturer/challenges, PATCH /:id, POST /:id/publish, DELETE /:id)', () => {
    it('ITC-CH-001 save a draft and publish it', async () => {
      const draft = await create({ title: 'Thử thách Lưu thủy' });
      expect(draft.status).toBe(201);
      expect(draft.body.message).toBe('Tạo thử thách thành công.');
      expect(draft.body.data.status).toBe('DRAFT');
      const id = draft.body.data.id as string;

      const updated = await F.patch(`${base}/${id}`, { instrumentId: tranhId, pieceId: p1, classIds: [c1, c2], weekStart }, gvA);
      expect(updated.status).toBe(200);
      expect(updated.body.message).toBe('Cập nhật thử thách thành công.');

      const published = await F.post(`${base}/${id}/publish`, {}, gvA);
      expect(published.status).toBe(200);
      expect(published.body.message).toBe('Đăng thử thách thành công.');
      expect(published.body.data).toMatchObject({ displayStatus: 'UPCOMING', startsAt: '2030-01-06T17:00:00.000Z' });

      expect(await TestDatabase.prisma.auditLog.count({ where: { action: 'CHALLENGE_PUBLISH' } })).toBe(1);
      for (const student of [sv1, sv2]) {
        expect((await F.notificationsOf(student.id)).map((item) => item.title)).toEqual(['Thử thách mới']);
      }
    });

    it('ITC-CH-002 validation of title, BPM, attempts and week format', async () => {
      const emptyTitle = await create({ title: '' });
      F.expectValidationError(emptyTitle, 'title');
      expect(emptyTitle.body.errors[0]).toMatchObject({ message: 'Tiêu đề không được để trống.', code: 'MSG-35' });

      const lowBpm = await create({ title: 'T', requiredBpm: 29 });
      F.expectValidationError(lowBpm, 'requiredBpm');
      expect(lowBpm.body.errors[0].message).toBe('BPM yêu cầu phải nằm trong khoảng từ 30 đến 240.');

      const tooManyAttempts = await create({ title: 'T', maxSubmissions: 11 });
      F.expectValidationError(tooManyAttempts, 'maxSubmissions');
      expect(tooManyAttempts.body.errors[0].message).toBe('Số lần nộp tối đa phải nằm trong khoảng từ 1 đến 10.');

      F.expectError(await create({ title: 'T', weekStart: '2030-01-08' }), 400, {
        code: 'MSG-08', field: 'weekStart', message: 'Không thể đăng thử thách vì tuần phải bắt đầu vào thứ Hai.'
      });
    });

    it('ITC-CH-003 publish with no piece / a past week / an empty class / a piece not ready', async () => {
      F.expectError(await create(publishBody({ pieceId: undefined })), 400, {
        code: 'MSG-35', field: 'pieceId', message: 'Bài nhạc không được để trống.'
      });
      F.expectError(await create(publishBody({ weekStart: '2020-01-06' })), 400, {
        code: 'MSG-04', field: 'weekStart', message: 'Không thể đăng thử thách vì không thể chọn tuần đã kết thúc.'
      });
      F.expectError(await create(publishBody({ classIds: [await createClass('Lớp C3', null)] })), 409, {
        code: 'MSG-08', message: 'Không thể đăng thử thách vì lớp chưa có sinh viên.'
      });
      const p4 = (await F.createSong(tranhId, 'Bài chưa phân tích')).id;
      await F.createSheet(p4, tranhId, { isAnalysed: false });
      F.expectError(await create(publishBody({ pieceId: p4 })), 400, {
        code: 'MSG-48', field: 'pieceId', message: 'Không thể đăng thử thách vì bài nhạc chưa có bản thu mẫu hoặc chưa phân tích xong.'
      });
    });

    it('ITC-CH-004 an overlapping challenge for the same class and week', async () => {
      await publishedChallenge();
      F.expectError(await create(publishBody({ title: 'Thử thách 2', classIds: [c2] })), 409, {
        code: 'MSG-08', message: 'Không thể đăng thử thách vì lớp đã có thử thách khác trong tuần này.'
      });
    });

    it('ITC-CH-005 a published challenge cannot be edited / deleted; a draft can be deleted', async () => {
      const ch1 = await publishedChallenge();
      F.expectError(await F.patch(`${base}/${ch1}`, { title: 'Mới' }, gvA), 409, {
        code: 'MSG-08', message: 'Không thể sửa thử thách vì thử thách đã được đăng.'
      });
      F.expectError(await F.delete(`${base}/${ch1}`, gvA), 409, {
        code: 'MSG-08', message: 'Không thể xóa thử thách vì thử thách đã được đăng.'
      });
      F.expectError(await F.post(`${base}/${ch1}/publish`, {}, gvA), 409, {
        code: 'MSG-08', message: 'Không thể đăng thử thách vì thử thách đã được đăng.'
      });

      const ch2 = (await create({ title: 'Nháp' })).body.data.id as string;
      const removed = await F.delete(`${base}/${ch2}`, gvA);
      expect(removed.status).toBe(200);
      expect(removed.body.message).toBe('Xóa thử thách thành công.');
    });
  });

  describe('Read (GET /lecturer/challenges, /form-meta, /pieces, /:id)', () => {
    it('ITC-CH-006 the list, form-meta and ready pieces', async () => {
      const ch1 = await publishedChallenge();
      const notReady = (await F.createSong(tranhId, 'Bài chưa sẵn sàng')).id;
      await F.createSheet(notReady, tranhId, { isAnalysed: false });

      const list = await F.get(`${base}?page=1&limit=20`, gvA);
      expect(list.status).toBe(200);
      expect(list.body.data.items).toEqual([expect.objectContaining({ id: ch1, displayStatus: 'UPCOMING' })]);

      const meta = await F.get(`${base}/form-meta`, gvA);
      expect(meta.status).toBe(200);
      expect(meta.body.data).toEqual({ defaultMinAccuracy: 70, maxSubmissionsDefault: 3 });

      const pieces = await F.get(`${base}/pieces?instrumentId=${tranhId}`, gvA);
      expect(pieces.status).toBe(200);
      expect(pieces.body.data.items.map((item: { id: string }) => item.id)).toEqual([p1]);
    });

    it('ITC-CH-007 another lecturer / a student / a Guest', async () => {
      const ch1 = await publishedChallenge();
      F.expectUnauthorized(await F.get(base));
      F.expectForbidden(await F.get(base, sv1));
      F.expectError(await F.get(`${base}/${ch1}`, gvB), 404, { message: F.messages.challengeNotFound });
    });
  });

  describe('More challenge checks', () => {
    it('ITC-CH-008 text, accuracy and class list rules', async () => {
      const longTitle = await create({ title: 'a'.repeat(101) });
      F.expectValidationError(longTitle, 'title');
      expect(longTitle.body.errors[0].message).toBe('Tiêu đề không được vượt quá 100 ký tự.');

      const longDescription = await create({ title: 'T', description: 'a'.repeat(2001) });
      F.expectValidationError(longDescription, 'description');
      expect(longDescription.body.errors[0].message).toBe('Mô tả không được vượt quá 2000 ký tự.');

      const highAccuracy = await create({ title: 'T', minAccuracy: 101 });
      F.expectValidationError(highAccuracy, 'minAccuracy');
      expect(highAccuracy.body.errors[0].message).toBe('Độ chính xác tối thiểu phải nằm trong khoảng từ 0 đến 100.');

      F.expectError(await create({ title: 'T', classIds: Array.from({ length: 51 }, () => randomUUID()) }), 400, { field: 'classIds' });
    });

    it('ITC-CH-009 a class that does not learn the challenge instrument', async () => {
      const bauId = (await TestDatabase.createInstrument('Đàn bầu')).id;
      const c5 = await createClass('Lớp C5', sv1, bauId);
      F.expectError(await create({ title: 'T', instrumentId: tranhId, pieceId: p1, classIds: [c5] }), 400, {
        message: 'Lớp đã chọn không học nhạc cụ của thử thách.'
      });
    });

    it('ITC-CH-010 a piece that is no longer in the library', async () => {
      await TestDatabase.prisma.piece.update({ where: { id: p1 }, data: { deletedAt: new Date() } });
      F.expectError(await create({ title: 'T', instrumentId: tranhId, pieceId: p1 }), 400, {
        message: 'Bài nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.'
      });
    });

    it('ITC-CH-011 a week that does not start on Monday', async () => {
      F.expectError(await create(publishBody({ weekStart: '2026-11-25' })), 400, {
        message: 'Không thể đăng thử thách vì tuần phải bắt đầu vào thứ Hai.'
      });
    });

    it('ITC-CH-012 an unknown challenge id', async () => {
      const unknown = randomUUID();
      F.expectError(await F.get(`${base}/${unknown}`, gvA), 404, { message: F.messages.challengeNotFound });
      F.expectError(await F.patch(`${base}/${unknown}`, { title: 'Mới' }, gvA), 404, { message: F.messages.challengeNotFound });
      F.expectError(await F.get(`${base}/abc`, gvA), 400, { field: 'id' });
    });

    it('ITC-CH-013 a draft can be saved without a piece and uses 3 attempts by default', async () => {
      const draft = await create({ title: 'Nháp' });
      expect(draft.status).toBe(201);
      expect(draft.body.message).toBe('Tạo thử thách thành công.');
      expect(draft.body.data).toMatchObject({ status: 'DRAFT', maxSubmissions: 3 });

      const updated = await F.patch(`${base}/${draft.body.data.id}`, { title: 'Nháp mới' }, gvA);
      expect(updated.status).toBe(200);
      expect(updated.body.message).toBe('Cập nhật thử thách thành công.');
    });

    it('ITC-CH-014 students of the class are told about a new challenge', async () => {
      const draft = await create(publishBody({ publish: false }));
      const published = await F.post(`${base}/${draft.body.data.id}/publish`, {}, gvA);
      expect(published.status).toBe(200);
      expect(published.body.message).toBe('Đăng thử thách thành công.');

      const inbox = await F.get('/me/notifications', sv1);
      expect(inbox.status).toBe(200);
      expect(inbox.body.data.items.map((item: { title: string }) => item.title)).toContain('Thử thách mới');
    });

    it('ITC-CH-015 the piece picker filters', async () => {
      const bauId = (await TestDatabase.createInstrument('Đàn bầu')).id;
      const song2 = await createReadySong('Ru con');
      const song3 = await createReadySong('Hát ru', bauId);
      const ids = (items: Array<{ id: string }>) => items.map((item) => item.id).sort();

      const byInstrument = await F.get(`${base}/pieces?instrumentId=${tranhId}`, gvA);
      expect(byInstrument.status).toBe(200);
      expect(ids(byInstrument.body.data.items)).toEqual([p1, song2].sort());

      const byTitle = await F.get(`${base}/pieces?q=ru`, gvA);
      expect(ids(byTitle.body.data.items)).toEqual([song2, song3].sort());

      expect((await F.get(`${base}/pieces?q=${'a'.repeat(101)}`, gvA)).status).toBe(400);
    });

    it('ITC-CH-016 an Admin and the list paging limit', async () => {
      F.expectForbidden(await F.get(base, await F.admin()));
      F.expectError(await F.get(`${base}?limit=101`, gvA), 400, { field: 'limit' });
    });
  });
});
