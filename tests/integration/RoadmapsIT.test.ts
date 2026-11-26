import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const api = '/api/v1';

const INVALID_SESSION = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
const FORBIDDEN = 'Bạn không có quyền thực hiện thao tác này.';
const CHECK_DATA = 'Kiểm tra lại dữ liệu gửi đi';
const SAVED = 'Lưu lộ trình thành công.';
const STALE = 'Không thể lưu lộ trình vì vừa có phiên bản mới. Vui lòng tải lại.';
const UNAVAILABLE = 'Bài luyện ngón đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.';
const NO_CLASS = 'Không tìm thấy lớp học.';

type Week = { weekNumber: number; title: string; content: string; exerciseIds: string[] };
type ErrorItem = { field: string; message: string };

function weeksPayload(exerciseIdsByWeek: string[][] = [], titlePrefix = 'Tuần'): Week[] {
  return [1, 2, 3, 4, 5, 6].map((weekNumber) => ({
    weekNumber,
    title: `${titlePrefix} ${weekNumber}`,
    content: `Nội dung tuần ${weekNumber}`,
    exerciseIds: exerciseIdsByWeek[weekNumber - 1] ?? []
  }));
}

describe('Roadmaps integration cases', () => {
  let admin: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let adminToken: string;
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let lecturerToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
    lecturer = await TestDatabase.createLecturer();
    lecturerToken = TestDatabase.tokenFor(lecturer);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const adminGet = (path: string) => request(app).get(`${api}/admin/roadmaps${path}`).set('Authorization', adminToken);
  const adminSave = (instrumentId: string, weeks: unknown, baseVersion: number | null) =>
    request(app).post(`${api}/admin/roadmaps/${instrumentId}/versions`).set('Authorization', adminToken).send({ weeks, baseVersion });
  const errorsOf = (body: { errors?: ErrorItem[] }) => (body.errors ?? []).map((item) => item.message);

  async function saveOk(instrumentId: string, baseVersion: number | null, weeks: Week[] = weeksPayload()) {
    const response = await adminSave(instrumentId, weeks, baseVersion);
    expect(response.status).toBe(201);
    return response.body.data as { id: string; version: number };
  }

  async function makeClassWithRoadmap(instrumentId: string, roadmapId: string, startOffset = -8) {
    const classRecord = await TestDatabase.createClass(lecturer.id, instrumentId, { startDate: TestDatabase.futureDate(startOffset) });
    await TestDatabase.prisma.class.update({ where: { id: classRecord.id }, data: { roadmapId } });
    return classRecord;
  }

  // ---------------------------------------------------------------- Admin roadmap

  it('ITC-RM-001 - Chỉ Admin mới dùng được API lộ trình (Guest 401, GV 403)', async () => {
    const guest = await request(app).get(`${api}/admin/roadmaps`);
    expect(guest.status).toBe(401);
    expect(guest.body).toMatchObject({ success: false, message: INVALID_SESSION });

    const asLecturer = await request(app).get(`${api}/admin/roadmaps`).set('Authorization', lecturerToken);
    expect(asLecturer.status).toBe(403);
    expect(asLecturer.body).toMatchObject({ success: false, message: FORBIDDEN });
  });

  it('ITC-RM-002 - Lưu phiên bản đầu tiên (baseVersion null) thành công', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    const matching = [];
    for (const title of ['Luyen ngon gay don', 'Luyen ngon ve', 'Luyen ngon rung']) {
      const piece = await TestDatabase.createPiece(tranh.id, { title });
      matching.push(piece.id);
    }
    await TestDatabase.createPiece(tranh.id, { title: 'Gam đô trưởng' });

    const search = await adminGet(`/${tranh.id}/exercises?q=luyen`);
    expect(search.status).toBe(200);
    expect(search.body.data.map((item: { id: string }) => item.id).sort()).toEqual([...matching].sort());

    const weeks = weeksPayload([matching]);
    const save = await adminSave(tranh.id, weeks, null);
    expect(save.status).toBe(201);
    expect(save.body.message).toBe(SAVED);
    expect(save.body.data.version).toBe(1);
    expect(await TestDatabase.prisma.roadmap.count({ where: { instrumentId: tranh.id } })).toBe(1);
  });

  it('ITC-RM-003 - Thiếu tuần / trùng bài / quá 50 bài bị từ chối 400', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    const pieces = [];
    for (let index = 0; index < 52; index += 1) pieces.push(await TestDatabase.createPiece(tranh.id, { title: `Luyện ngón ${index}` }));
    await saveOk(tranh.id, null);

    const missing = await adminSave(tranh.id, weeksPayload().slice(0, 5), 1);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe(CHECK_DATA);
    expect(errorsOf(missing.body)).toContain('Lộ trình phải có đủ 6 tuần.');

    const duplicated = await adminSave(tranh.id, weeksPayload([[], [pieces[0].id, pieces[0].id]]), 1);
    expect(duplicated.status).toBe(400);
    expect(errorsOf(duplicated.body)).toContain('Bài luyện ngón bị chọn trùng trong tuần.');

    const tooMany = await adminSave(tranh.id, weeksPayload([pieces.slice(0, 51).map((piece) => piece.id)]), 1);
    expect(tooMany.status).toBe(400);
    expect(errorsOf(tooMany.body)).toContain('Mỗi tuần tối đa 50 bài luyện ngón.');
    expect(await TestDatabase.prisma.roadmap.count({ where: { instrumentId: tranh.id } })).toBe(1);
  });

  it('ITC-RM-004 - Lưu với baseVersion cũ bị từ chối 409', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    await saveOk(tranh.id, null);
    await saveOk(tranh.id, 1);

    const response = await adminSave(tranh.id, weeksPayload(), 1);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, message: STALE });
    expect(await TestDatabase.prisma.roadmap.count({ where: { instrumentId: tranh.id } })).toBe(2);
  });

  it('ITC-RM-005 - Nhạc cụ không tồn tại 404 và id không phải uuid 400', async () => {
    const unknown = await adminGet('/00000000-0000-4000-8000-000000000000');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ success: false, message: 'Không tìm thấy nhạc cụ.' });

    const invalid = await adminGet('/dan-tranh');
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ success: false, field: 'instrumentId', message: CHECK_DATA });
    expect(invalid.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'instrumentId' })]));
    expect(invalid.body).not.toHaveProperty('code');
  });

  // ---------------------------------------------------------------- Class roadmap

  it('ITC-RM-006 - Chủ lớp và thành viên đọc được lộ trình lớp', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    const roadmap = await saveOk(tranh.id, null, weeksPayload([], 'Tuần học'));
    const classRecord = await makeClassWithRoadmap(tranh.id, roadmap.id);
    const student = await TestDatabase.createUser();
    await TestDatabase.addMember(classRecord.id, student.id, lecturer.id);

    const asLecturer = await request(app).get(`${api}/classes/${classRecord.id}/roadmap`).set('Authorization', lecturerToken);
    expect(asLecturer.status).toBe(200);
    const weeks = asLecturer.body.data.roadmap.weeks as Array<{ status: string; title: string }>;
    expect(weeks).toHaveLength(6);
    expect(weeks.map((week) => week.status)).toEqual(['PAST', 'CURRENT', 'UPCOMING', 'UPCOMING', 'UPCOMING', 'UPCOMING']);

    const asStudent = await request(app).get(`${api}/classes/${classRecord.id}/roadmap`).set('Authorization', TestDatabase.tokenFor(student));
    expect(asStudent.status).toBe(200);
    expect(asStudent.body.data).toEqual(asLecturer.body.data);
  });

  it('ITC-RM-007 - Người ngoài lớp 404, Admin 403 khi đọc lộ trình lớp', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    const roadmap = await saveOk(tranh.id, null);
    const classRecord = await makeClassWithRoadmap(tranh.id, roadmap.id);
    const otherLecturer = await TestDatabase.createLecturer();
    const outsider = await TestDatabase.createUser();
    const get = (token: string) => request(app).get(`${api}/classes/${classRecord.id}/roadmap`).set('Authorization', token);

    for (const user of [otherLecturer, outsider]) {
      const response = await get(TestDatabase.tokenFor(user));
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, message: NO_CLASS });
    }
    const asAdmin = await get(adminToken);
    expect(asAdmin.status).toBe(403);
    expect(asAdmin.body).toMatchObject({ success: false, message: FORBIDDEN });
  });

  // ---------------------------------------------------------------- More roadmap checks

  it('ITC-RM-008 - Nhạc cụ chưa có lộ trình hiển thị khung 6 tuần chuẩn', async () => {
    const instrument = await TestDatabase.createInstrument('Đàn bầu');
    const response = await adminGet(`/${instrument.id}`);
    expect(response.status).toBe(200);
    const { weeks, version } = response.body.data as { weeks: Array<{ title: string }>; version: number | null };
    expect(weeks).toHaveLength(6);
    expect(weeks[0].title).toBe('Làm quen nhạc cụ & kỹ thuật cơ bản');
    expect(weeks[5].title).toBe('Biểu diễn cuối khóa (Final Performance)');
    expect(version).toBeNull();
    expect(await TestDatabase.prisma.roadmap.count({ where: { instrumentId: instrument.id } })).toBe(0);
  });

  it('ITC-RM-009 - Tiêu đề hoặc nội dung tuần để trống bị từ chối 400', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    await saveOk(tranh.id, null);

    const emptyTitle = weeksPayload();
    emptyTitle[1].title = '';
    const first = await adminSave(tranh.id, emptyTitle, 1);
    expect(first.status).toBe(400);
    expect(errorsOf(first.body)).toContain('Tiêu đề tuần 2 không được để trống.');

    const emptyContent = weeksPayload();
    emptyContent[2].content = '';
    const second = await adminSave(tranh.id, emptyContent, 1);
    expect(second.status).toBe(400);
    expect(errorsOf(second.body)).toContain('Nội dung học tập tuần 3 không được để trống.');
  });

  it('ITC-RM-010 - Giới hạn độ dài tiêu đề và nội dung của tuần', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    await saveOk(tranh.id, null);

    const longTitle = weeksPayload();
    longTitle[0].title = 'a'.repeat(101);
    const first = await adminSave(tranh.id, longTitle, 1);
    expect(first.status).toBe(400);
    expect(errorsOf(first.body)).toContain('Tiêu đề tuần 1 không được vượt quá 100 ký tự.');

    const longContent = weeksPayload();
    longContent[0].content = 'a'.repeat(1001);
    const second = await adminSave(tranh.id, longContent, 1);
    expect(second.status).toBe(400);
    expect(errorsOf(second.body)).toContain('Nội dung học tập tuần 1 không được vượt quá 1000 ký tự.');
  });

  it('ITC-RM-011 - Bài luyện ngón đã bị xóa khỏi thư viện bị từ chối 400', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    await saveOk(tranh.id, null);
    const deleted = await TestDatabase.createPiece(tranh.id);
    await TestDatabase.prisma.piece.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const response = await adminSave(tranh.id, weeksPayload([[deleted.id]]), 1);
    expect(response.status).toBe(400);
    expect(errorsOf(response.body)).toContain(UNAVAILABLE);
  });

  it('ITC-RM-012 - Lưu hợp lệ tạo phiên bản mới mà lớp nhìn thấy', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    const v1 = await saveOk(tranh.id, null);
    const classRecord = await makeClassWithRoadmap(tranh.id, v1.id);

    const save = await adminSave(tranh.id, weeksPayload([], 'Tuần mới'), 1);
    expect(save.status).toBe(201);
    expect(save.body.message).toBe(SAVED);

    const latest = await adminGet(`/${tranh.id}`);
    expect(latest.body.data.version).toBe(2);

    const titlesOf = async (classId: string) => {
      const response = await request(app).get(`${api}/classes/${classId}/roadmap`).set('Authorization', lecturerToken);
      expect(response.status).toBe(200);
      return (response.body.data.roadmap.weeks as Array<{ title: string }>).map((week) => week.title);
    };
    expect(await titlesOf(classRecord.id)).toEqual([1, 2, 3, 4, 5, 6].map((number) => `Tuần ${number}`));

    const created = await request(app).post(`${api}/classes`).set('Authorization', lecturerToken)
      .send({ name: 'DTR101.M9', cohort: 'FA26', instrumentId: tranh.id });
    expect(created.status).toBe(201);
    expect(await titlesOf(created.body.data.id)).toEqual([1, 2, 3, 4, 5, 6].map((number) => `Tuần mới ${number}`));
  });

  it('ITC-RM-013 - Tìm bài luyện ngón cho tuần theo từ khóa', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    await TestDatabase.createPiece(tranh.id, { title: 'Luyện ngón gam đô' });
    await TestDatabase.createPiece(tranh.id, { title: 'Luyện ngón gam rê' });
    await TestDatabase.createPiece(tranh.id, { title: 'Luyện ngón vê' });
    await TestDatabase.createPiece(bau.id, { title: 'Luyện ngón gam bầu' });

    const found = await adminGet(`/${tranh.id}/exercises?q=gam`);
    expect(found.status).toBe(200);
    expect(found.body.data.map((item: { title: string }) => item.title).sort()).toEqual(['Luyện ngón gam rê', 'Luyện ngón gam đô'].sort());

    const tooLong = await adminGet(`/${tranh.id}/exercises?q=${'a'.repeat(101)}`);
    expect(tooLong.status).toBe(400);
  });

  it('ITC-RM-014 - Danh sách lộ trình của mọi nhạc cụ', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    await TestDatabase.createInstrument('Đàn bầu');
    await saveOk(tranh.id, null);

    const response = await adminGet('');
    expect(response.status).toBe(200);
    const byName = Object.fromEntries(
      (response.body.data as Array<{ instrument: { name: string }; latestVersion: { version: number } | null }>).map((item) => [item.instrument.name, item.latestVersion])
    );
    expect(Object.keys(byName).sort()).toEqual(['Đàn bầu', 'Đàn tranh']);
    expect(byName['Đàn tranh']).toMatchObject({ version: 1 });
    expect(byName['Đàn bầu']).toBeNull();
  });

  it('ITC-RM-015 - Số tuần không nằm trong 1 đến 6 bị từ chối 400', async () => {
    const tranh = await TestDatabase.createInstrument('Đàn tranh');
    await saveOk(tranh.id, null);
    const weeks = weeksPayload();
    weeks[5].weekNumber = 7;

    const response = await adminSave(tranh.id, weeks, 1);
    expect(response.status).toBe(400);
    expect(errorsOf(response.body)).toContain('Lộ trình phải có đủ 6 tuần.');
  });
});
