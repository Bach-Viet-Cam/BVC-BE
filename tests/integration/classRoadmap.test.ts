import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const ADMIN_ROLE = 3;

function weeksPayload(exerciseIds: string[] = []) {
  return [1, 2, 3, 4, 5, 6].map((weekNumber) => ({
    weekNumber,
    title: `Tuần ${weekNumber}`,
    content: `Nội dung tuần ${weekNumber}`,
    exerciseIds: weekNumber === 1 ? exerciseIds : []
  }));
}

describe('Class roadmap (UC-11 pinning + read-only tab)', () => {
  let adminToken: string;
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let lecturerToken: string;
  let tranh: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;

  beforeEach(async () => {
    await TestDatabase.reset();
    adminToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: ADMIN_ROLE }));
    lecturer = await TestDatabase.createLecturer();
    lecturerToken = TestDatabase.tokenFor(lecturer);
    tranh = await TestDatabase.createInstrument('Đàn tranh');
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  async function saveRoadmap(instrumentId: string, exerciseIds: string[] = []): Promise<string> {
    const response = await request(app).post(`/api/v1/admin/roadmaps/${instrumentId}/versions`).set('Authorization', adminToken).send({ weeks: weeksPayload(exerciseIds), baseVersion: (await TestDatabase.prisma.roadmap.aggregate({ where: { instrumentId }, _max: { version: true } }))._max.version ?? null });
    expect(response.status).toBe(201);
    return response.body.data.id;
  }

  async function createClassViaApi(instrumentId: string, startDate: string = TestDatabase.futureDate(7)): Promise<string> {
    const response = await request(app).post('/api/v1/classes').set('Authorization', lecturerToken)
      .send({ name: `Lớp ${TestDatabase.nextId()}`, cohort: 'FA26', instrumentId, startDate });
    expect(response.status).toBe(201);
    return response.body.data.id;
  }

  const roadmapIdOf = async (classId: string) => (await TestDatabase.prisma.class.findUniqueOrThrow({ where: { id: classId } })).roadmapId;

  it('new class is pinned to the latest version', async () => {
    await saveRoadmap(tranh.id);
    const v2 = await saveRoadmap(tranh.id);
    expect(await roadmapIdOf(await createClassViaApi(tranh.id))).toBe(v2);
  });

  it('older class keeps v1 after v2 is saved', async () => {
    const v1 = await saveRoadmap(tranh.id);
    const classId = await createClassViaApi(tranh.id);
    await saveRoadmap(tranh.id);
    expect(await roadmapIdOf(classId)).toBe(v1);
  });

  it('instrument change re-pins then backfills', async () => {
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    const tyBa = await TestDatabase.createInstrument('Tỳ bà');
    const bauV1 = await saveRoadmap(bau.id);
    await saveRoadmap(tranh.id);
    const classId = await createClassViaApi(tranh.id);

    await request(app).patch(`/api/v1/classes/${classId}`).set('Authorization', lecturerToken).send({ instrumentId: bau.id }).expect(200);
    expect(await roadmapIdOf(classId)).toBe(bauV1);

    await request(app).patch(`/api/v1/classes/${classId}`).set('Authorization', lecturerToken).send({ instrumentId: tyBa.id }).expect(200);
    expect(await roadmapIdOf(classId)).toBeNull();

    const tyBaV1 = await saveRoadmap(tyBa.id);
    expect(await roadmapIdOf(classId)).toBe(tyBaV1);
  });

  it('owner gets 6 weeks with dates/status/exercises', async () => {
    const piece = await TestDatabase.createPiece(tranh.id, { title: 'Luyện ngón — Gẩy đơn' });
    await saveRoadmap(tranh.id, [piece.id]);
    const startDate = TestDatabase.futureDate(-8);
    const classRecord = await TestDatabase.createClass(lecturer.id, tranh.id, { startDate });
    await TestDatabase.prisma.class.update({ where: { id: classRecord.id }, data: { roadmapId: await TestDatabase.prisma.roadmap.findFirstOrThrow().then((row) => row.id) } });

    const response = await request(app).get(`/api/v1/classes/${classRecord.id}/roadmap`).set('Authorization', lecturerToken);
    expect(response.status).toBe(200);
    const { roadmap } = response.body.data;
    expect(roadmap.version).toBe(1);
    expect(roadmap.weeks).toHaveLength(6);
    expect(roadmap.weeks.map((week: { status: string }) => week.status)).toEqual(['PAST', 'CURRENT', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING']);
    expect(roadmap.weeks[0]).toMatchObject({
      weekNumber: 1,
      title: 'Tuần 1',
      startDate,
      endDate: TestDatabase.futureDate(-2),
      exercises: [{ pieceId: piece.id, title: 'Luyện ngón — Gẩy đơn', isAvailable: true }]
    });
    // Assignments are no longer tied to roadmap weeks (user decision 16/10).
    expect(roadmap.weeks[0]).not.toHaveProperty('assignments');
  });

  it('class roadmap marks hidden exercise unavailable', async () => {
    const piece = await TestDatabase.createPiece(tranh.id);
    await saveRoadmap(tranh.id, [piece.id]);
    const classId = await createClassViaApi(tranh.id);
    await TestDatabase.prisma.piece.update({ where: { id: piece.id }, data: { visibility: 'HIDDEN' } });

    const response = await request(app).get(`/api/v1/classes/${classId}/roadmap`).set('Authorization', lecturerToken);
    expect(response.body.data.roadmap.weeks[0].exercises).toEqual([{ pieceId: piece.id, title: piece.title, isAvailable: false }]);
  });

  it('active student member can read; removed student, other student, other lecturer get 404', async () => {
    await saveRoadmap(tranh.id);
    const classId = await createClassViaApi(tranh.id);
    const member = await TestDatabase.createUser();
    const removed = await TestDatabase.createUser();
    const outsider = await TestDatabase.createUser();
    await TestDatabase.addMember(classId, member.id, lecturer.id);
    const removedMembership = await TestDatabase.addMember(classId, removed.id, lecturer.id);
    await TestDatabase.prisma.classMember.update({ where: { id: removedMembership.id }, data: { removedAt: new Date() } });
    const otherLecturer = await TestDatabase.createLecturer();

    const get = (token: string) => request(app).get(`/api/v1/classes/${classId}/roadmap`).set('Authorization', token);
    expect((await get(TestDatabase.tokenFor(member))).status).toBe(200);
    expect((await get(TestDatabase.tokenFor(removed))).status).toBe(404);
    expect((await get(TestDatabase.tokenFor(outsider))).status).toBe(404);
    expect((await get(TestDatabase.tokenFor(otherLecturer))).status).toBe(404);
    expect((await get(adminToken)).status).toBe(403);
  });

  it('class without roadmap returns { roadmap: null }', async () => {
    const classId = await createClassViaApi(tranh.id);
    const response = await request(app).get(`/api/v1/classes/${classId}/roadmap`).set('Authorization', lecturerToken);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ roadmap: null });
  });
});
