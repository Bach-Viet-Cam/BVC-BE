import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const ADMIN_ROLE = 3;

function weeksPayload(exerciseIdsByWeek: string[][] = []) {
  return [1, 2, 3, 4, 5, 6].map((weekNumber) => ({
    weekNumber,
    title: `Tuần ${weekNumber}`,
    content: `Nội dung tuần ${weekNumber}`,
    exerciseIds: exerciseIdsByWeek[weekNumber - 1] ?? []
  }));
}

describe('Admin roadmaps API (UC-11)', () => {
  let adminToken: string;
  let admin: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let tranh: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;

  beforeEach(async () => {
    await TestDatabase.reset();
    admin = await TestDatabase.createUser({ role: ADMIN_ROLE });
    adminToken = TestDatabase.tokenFor(admin);
    tranh = await TestDatabase.createInstrument('Đàn tranh');
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await TestDatabase.prisma.$disconnect();
  });

  // baseVersion defaults to the current latest version, i.e. an admin editing an up-to-date copy.
  async function save(instrumentId: string, weeks: unknown, baseVersion?: number | null) {
    const latest = await TestDatabase.prisma.roadmap.aggregate({ where: { instrumentId }, _max: { version: true } });
    const base = baseVersion === undefined ? latest._max.version ?? null : baseVersion;
    return request(app).post(`/api/v1/admin/roadmaps/${instrumentId}/versions`).set('Authorization', adminToken).send({ weeks, baseVersion: base });
  }

  it('lists active instruments with null or latest version', async () => {
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    await TestDatabase.createInstrument('Đàn cũ', false);
    await save(bau.id, weeksPayload());
    await save(bau.id, weeksPayload());

    const response = await request(app).get('/api/v1/admin/roadmaps').set('Authorization', adminToken);
    expect(response.status).toBe(200);
    const byName = Object.fromEntries(response.body.data.map((item: { instrument: { name: string }; latestVersion: unknown }) => [item.instrument.name, item.latestVersion]));
    expect(Object.keys(byName).sort()).toEqual(['Đàn bầu', 'Đàn tranh']);
    expect(byName['Đàn tranh']).toBeNull();
    expect(byName['Đàn bầu']).toMatchObject({ version: 2 });
  });

  it('returns the standard framework when no version exists', async () => {
    const response = await request(app).get(`/api/v1/admin/roadmaps/${tranh.id}`).set('Authorization', adminToken);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: null, version: null, isTemplate: true, createdAt: null, instrument: { id: tranh.id, name: 'Đàn tranh' } });
    expect(response.body.data.weeks.map((week: { title: string }) => week.title)).toEqual([
      'Làm quen nhạc cụ & kỹ thuật cơ bản',
      'Bài tập kỹ thuật & Bài 1',
      'Bài 1, kiểm tra cá nhân & trình bày nhóm',
      'Hoàn thiện kỹ thuật & chuẩn bị hòa tấu',
      'Ghép nhóm hòa tấu',
      'Biểu diễn cuối khóa (Final Performance)'
    ]);
    expect(response.body.data.weeks.every((week: { content: string; exercises: unknown[] }) => week.content === '' && week.exercises.length === 0)).toBe(true);
    expect(await TestDatabase.prisma.roadmap.count()).toBe(0);
  });

  it('lists only visible finger exercises of the instrument, filtered by q', async () => {
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    await TestDatabase.createPiece(tranh.id, { title: 'Luyện ngón — Gẩy đơn' });
    await TestDatabase.createPiece(tranh.id, { title: 'Luyện ngón — Vê' });
    await TestDatabase.createPiece(tranh.id, { title: 'Lý ngựa ô', kind: 'SONG' });
    await TestDatabase.createPiece(tranh.id, { title: 'Luyện ngón — Ẩn', isVisible: false });
    await TestDatabase.createPiece(bau.id, { title: 'Luyện ngón — Bầu' });

    const all = await request(app).get(`/api/v1/admin/roadmaps/${tranh.id}/exercises`).set('Authorization', adminToken);
    expect(all.body.data.map((item: { title: string }) => item.title)).toEqual(['Luyện ngón — Gẩy đơn', 'Luyện ngón — Vê']);
    const filtered = await request(app).get(`/api/v1/admin/roadmaps/${tranh.id}/exercises`).query({ q: 'vê' }).set('Authorization', adminToken);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({ title: 'Luyện ngón — Vê', defaultBpm: 90 });
  });

  it('saves v1 then v2 with exercises in submitted order', async () => {
    const first = await TestDatabase.createPiece(tranh.id, { title: 'A' });
    const second = await TestDatabase.createPiece(tranh.id, { title: 'B' });

    const v1 = await save(tranh.id, weeksPayload([[first.id, second.id]]));
    expect(v1.status).toBe(201);
    expect(v1.body.message).toBe('Lưu lộ trình thành công.');
    expect(v1.body.data).toMatchObject({ version: 1, isTemplate: false });

    const v2 = await save(tranh.id, weeksPayload([[second.id, first.id]]));
    expect(v2.body.data.version).toBe(2);

    const latest = await request(app).get(`/api/v1/admin/roadmaps/${tranh.id}`).set('Authorization', adminToken);
    expect(latest.body.data.version).toBe(2);
    expect(latest.body.data.weeks[0].exercises.map((item: { title: string }) => item.title)).toEqual(['B', 'A']);
    expect(latest.body.data.weeks[0].exercises[0]).toMatchObject({ pieceId: second.id, isAvailable: true });
  });

  it('keeps v1 rows unchanged after saving v2', async () => {
    await save(tranh.id, weeksPayload());
    const changed = weeksPayload();
    changed[0].title = 'Tuần 1 mới';
    await save(tranh.id, changed);
    const v1 = await TestDatabase.prisma.roadmap.findFirstOrThrow({ where: { instrumentId: tranh.id, version: 1 }, include: { weeks: { orderBy: { weekNumber: 'asc' } } } });
    expect(v1.weeks).toHaveLength(6);
    expect(v1.weeks[0].title).toBe('Tuần 1');
  });

  it('backfills only ACTIVE classes without a roadmap on save', async () => {
    const lecturer = await TestDatabase.createLecturer();
    const activeWithout = await TestDatabase.createClass(lecturer.id, tranh.id);
    const finishedWithout = await TestDatabase.createClass(lecturer.id, tranh.id, { status: 'ENDED' });
    const v1 = await save(tranh.id, weeksPayload());
    const pinnedToV1 = await TestDatabase.createClass(lecturer.id, tranh.id);
    await TestDatabase.prisma.class.update({ where: { id: pinnedToV1.id }, data: { roadmapId: v1.body.data.id } });
    await save(tranh.id, weeksPayload());

    const reload = (id: string) => TestDatabase.prisma.class.findUniqueOrThrow({ where: { id } });
    expect((await reload(activeWithout.id)).roadmapId).toBe(v1.body.data.id);
    expect((await reload(finishedWithout.id)).roadmapId).toBeNull();
    expect((await reload(pinnedToV1.id)).roadmapId).toBe(v1.body.data.id);
  });

  it('returns 400 with per-week errors', async () => {
    const weeks = weeksPayload();
    weeks[0].title = '  ';
    const response = await save(tranh.id, weeks);
    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual({ field: 'weeks.1.title', code: 'MSG-35', message: 'Tiêu đề tuần 1 không được để trống.' });
    expect(await TestDatabase.prisma.roadmap.count()).toBe(0);
  });

  it('saveVersion rejects a hidden exercise', async () => {
    const hidden = await TestDatabase.createPiece(tranh.id, { isVisible: false });
    const response = await save(tranh.id, weeksPayload([[], [hidden.id]]));
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      { field: 'weeks.2.exerciseIds', code: 'MSG-48', message: 'Bài luyện ngón đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.' }
    ]);
    expect(await TestDatabase.prisma.roadmap.count()).toBe(0);
  });

  it('stale save based on an older version returns 409 and keeps the latest version', async () => {
    await save(tranh.id, weeksPayload(), null);
    const editedByA = weeksPayload();
    editedByA[0].title = 'Bản của A';
    expect((await save(tranh.id, editedByA, 1)).status).toBe(201);

    const staleFromB = await save(tranh.id, weeksPayload(), 1);
    expect(staleFromB.status).toBe(409);
    expect(staleFromB.body.message).toBe('Không thể lưu lộ trình vì vừa có phiên bản mới. Vui lòng tải lại.');
    const latest = await request(app).get(`/api/v1/admin/roadmaps/${tranh.id}`).set('Authorization', adminToken);
    expect(latest.body.data).toMatchObject({ version: 2 });
    expect(latest.body.data.weeks[0].title).toBe('Bản của A');
  });

  it('saving the standard framework when a version already exists returns 409', async () => {
    await save(tranh.id, weeksPayload(), null);
    expect((await save(tranh.id, weeksPayload(), null)).status).toBe(409);
    expect(await TestDatabase.prisma.roadmap.count()).toBe(1);
  });

  it('requires baseVersion in the body', async () => {
    const response = await request(app).post(`/api/v1/admin/roadmaps/${tranh.id}/versions`).set('Authorization', adminToken).send({ weeks: weeksPayload() });
    expect(response.status).toBe(400);
  });

  it('concurrent save returns 409', async () => {
    const prisma = TestDatabase.prisma;
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((callback: (client: unknown) => Promise<unknown>) =>
      originalTransaction(async (transaction) => {
        // Another admin commits version 1 between our max(version) read and our insert.
        const proxied = new Proxy(transaction, {
          get(target, property) {
            if (property !== 'roadmap') return Reflect.get(target, property);
            return new Proxy(target.roadmap, {
              get(delegate, method) {
                if (method !== 'create') return Reflect.get(delegate, method);
                return async (args: { data: { version: number } }) => {
                  await prisma.roadmap.create({ data: { instrumentId: tranh.id, version: args.data.version, createdById: admin.id } });
                  return delegate.create(args as never);
                };
              }
            });
          }
        });
        return callback(proxied);
      })) as never);

    const response = await save(tranh.id, weeksPayload());
    spy.mockRestore();
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Không thể lưu lộ trình vì vừa có phiên bản mới. Vui lòng tải lại.');
    expect(await prisma.roadmap.count()).toBe(1);
  });

  it('forbids lecturers and students (403) and unknown instrument (404)', async () => {
    const lecturer = await TestDatabase.createLecturer();
    const student = await TestDatabase.createUser();
    for (const user of [lecturer, student]) {
      const response = await request(app).get('/api/v1/admin/roadmaps').set('Authorization', TestDatabase.tokenFor(user));
      expect(response.status).toBe(403);
    }
    const asLecturer = await request(app).post(`/api/v1/admin/roadmaps/${tranh.id}/versions`).set('Authorization', TestDatabase.tokenFor(lecturer)).send({ weeks: weeksPayload(), baseVersion: null });
    expect(asLecturer.status).toBe(403);

    const inactive = await TestDatabase.createInstrument('Đàn cũ', false);
    expect((await request(app).get(`/api/v1/admin/roadmaps/${inactive.id}`).set('Authorization', adminToken)).status).toBe(404);
    expect((await save('6f1c2e9a-0000-4000-8000-000000000000', weeksPayload())).status).toBe(404);
  });
});
