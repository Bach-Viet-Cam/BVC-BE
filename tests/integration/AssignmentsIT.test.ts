import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

const VALIDATION_MESSAGE = 'Kiểm tra lại dữ liệu gửi đi';
const FORBIDDEN_MESSAGE = 'Bạn không có quyền thực hiện thao tác này.';
const NOT_FOUND_MESSAGE = 'Không tìm thấy bài tập.';
const STUDENT_NOT_AVAILABLE = 'Không thể mở bài tập vì bài tập không còn khả dụng.';
const SHEET_GROUP_NOT_FOUND = 'Không tìm thấy bài tập dùng sheet nhạc này trong học kỳ hiện tại.';
const ENDED_CLASS_MESSAGE = 'Không thể thay đổi lớp vì lớp đã kết thúc.';
const CLOSE_CONFLICT = 'Không thể đóng bài tập vì bài tập chưa được đăng hoặc đã đóng.';
const REOPEN_CONFLICT = 'Không thể mở lại bài tập vì bài tập chưa bị đóng.';
const PUBLISH_CONFLICT = 'Không thể đăng bài tập vì bài tập không ở trạng thái nháp.';
const BPM_MESSAGE = 'BPM yêu cầu phải nằm trong khoảng từ 1 đến 300.';
const MISSING_ID = '6f1c2e9a-0000-4000-8000-000000000000';

type Kind = 'SOLO' | 'ENSEMBLE' | 'BONUS' | 'OTHER';
type Status = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

describe('Assignments integration cases (UC-13)', () => {
  let gvA: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let gvB: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let admin: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let sv1: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let sv2: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let tranh: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;
  let c1: Awaited<ReturnType<typeof TestDatabase.createClass>>;
  let s1: Awaited<ReturnType<typeof TestDatabase.createSheetMusic>>;
  let tokenA: string;
  let tokenB: string;
  let tokenAdmin: string;
  let tokenSv1: string;

  const currentSemester = () => [{ name: 'CUR', startDate: TestDatabase.futureDate(-30), endDate: TestDatabase.futureDate(30) }];

  beforeEach(async () => {
    await TestDatabase.reset();
    await TestDatabase.resetSemesters(currentSemester());
    gvA = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    gvB = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    sv1 = await TestDatabase.createUser({ username: 'SV-1', studentCode: 'SE1' });
    sv2 = await TestDatabase.createUser({ username: 'SV-2', studentCode: 'SE2' });
    tokenA = TestDatabase.tokenFor(gvA);
    tokenB = TestDatabase.tokenFor(gvB);
    tokenAdmin = TestDatabase.tokenFor(admin);
    tokenSv1 = TestDatabase.tokenFor(sv1);
    tranh = await TestDatabase.createInstrument('Đàn tranh');
    c1 = await newClass(gvA);
    await TestDatabase.addMember(c1.id, sv1.id, gvA.id);
    await TestDatabase.addMember(c1.id, sv2.id, gvA.id);
    s1 = await newSheet();
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const newClass = (lecturer: { id: string }, overrides: Partial<{ name: string; status: 'ACTIVE' | 'ENDED' }> = {}) =>
    TestDatabase.createClass(lecturer.id, tranh.id, { cohort: 'CUR', startDate: TestDatabase.futureDate(-3), ...overrides });

  async function newSheet(visibility: 'PUBLIC' | 'HIDDEN' = 'PUBLIC') {
    const piece = await TestDatabase.createPiece(tranh.id, { kind: 'SONG' });
    return TestDatabase.createSheetMusic(piece.id, tranh.id, { visibility });
  }

  const newAssignment = (classId: string, lecturerId: string, overrides: Partial<{ title: string; kind: Kind; status: Status; sheetMusicId: string | null }> = {}) =>
    TestDatabase.createAssignment(classId, lecturerId, overrides);

  const call = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string, body?: object) => {
    const req = request(app)[method](`/api/v1${path}`);
    if (token) req.set('Authorization', token);
    return body === undefined ? req : req.send(body);
  };
  const create = (body: object, token: string = tokenA) => call('post', '/assignments', token, body);
  const comment = (id: string, content: unknown, token: string = tokenA) => call('put', `/submissions/${id}/comment`, token, { content });
  const notificationCount = (title: string) =>
    TestDatabase.prisma.userNotification.count({ where: { notification: { title } } });

  function expectValidation(response: request.Response, field: string, message?: string, code?: string) {
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.field).toBe(field);
    expect(response.body.message).toBe(VALIDATION_MESSAGE);
    expect(response.body.code).toBeUndefined();
    expect(response.body.errors[0].field).toBe(field);
    if (message) expect(response.body.errors[0].message).toBe(message);
    if (code) expect(response.body.errors[0].code).toBe(code);
  }

  describe('Tạo và quản lý bài tập', () => {
    it('ITC-AS-001 - Tạo bản nháp rồi đăng, lớp nhận thông báo', async () => {
      const pickList = await call('get', `/assignments/sheet-music?classId=${c1.id}`, tokenA);
      expect(pickList.status).toBe(200);
      expect(pickList.body.data.map((item: { id: string }) => item.id)).toContain(s1.id);

      const created = await create({ classId: c1.id, title: 'Tuần 4', kind: 'SOLO', sheetMusicId: s1.id, requiredBpm: 72 });
      expect(created.status).toBe(201);
      expect(created.body.message).toBe('Tạo bài tập thành công.');
      expect(created.body.data.status).toBe('DRAFT');

      const published = await call('post', `/assignments/${created.body.data.id}/publish`, tokenA);
      expect(published.status).toBe(200);
      expect(published.body.message).toBe('Đăng bài tập thành công.');
      expect(published.body.data.status).toBe('PUBLISHED');
      expect(await notificationCount('Bài tập mới')).toBe(2);
    });

    it('ITC-AS-002 - Validate thiếu kind, BPM ngoài 1-300, tiêu đề 201 ký tự', async () => {
      expectValidation(await create({ classId: c1.id, title: 'T' }), 'kind', 'Loại bài không được để trống.', 'MSG-35');
      expectValidation(await create({ classId: c1.id, title: 'T', kind: 'SOLO', requiredBpm: 301 }), 'requiredBpm', BPM_MESSAGE, 'MSG-03');
      expectValidation(await create({ classId: c1.id, title: 'a'.repeat(201), kind: 'SOLO' }), 'title', 'Tiêu đề không được vượt quá 200 ký tự.', 'MSG-37');
      expectValidation(await create({ classId: c1.id, title: 'T', kind: 'SOLO', sheetMusicId: '' }), 'sheetMusicId');
    });

    it('ITC-AS-003 - Lớp đã có bài Độc tấu không tạo thêm được bài Độc tấu', async () => {
      await newAssignment(c1.id, gvA.id, { kind: 'SOLO', sheetMusicId: s1.id });
      const response = await create({ classId: c1.id, title: 'Tuần 5', kind: 'SOLO', sheetMusicId: s1.id });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ success: false, code: 'MSG-08', field: 'kind', message: 'Không thể lưu bài tập vì lớp đã có bài Độc tấu.' });
    });

    it('ITC-AS-004 - Bản nhạc không khả dụng bị từ chối', async () => {
      const hidden = await newSheet('HIDDEN');
      const response = await create({ classId: c1.id, title: 'Hòa tấu', kind: 'ENSEMBLE', sheetMusicId: hidden.id });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        code: 'MSG-48',
        field: 'sheetMusicId',
        message: 'Bản nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.'
      });
    });

    it('ITC-AS-005 - Chuyển trạng thái sai thứ tự bị từ chối', async () => {
      const assignment = await newAssignment(c1.id, gvA.id, { title: 'Tuần 4', status: 'DRAFT', sheetMusicId: s1.id });
      const action = (name: string) => call('post', `/assignments/${assignment.id}/${name}`, tokenA);

      const close = await action('close');
      expect(close.status).toBe(409);
      expect(close.body).toMatchObject({ success: false, code: 'MSG-08', message: CLOSE_CONFLICT });
      const reopen = await action('reopen');
      expect(reopen.status).toBe(409);
      expect(reopen.body).toMatchObject({ success: false, code: 'MSG-08', message: REOPEN_CONFLICT });
      expect((await action('publish')).status).toBe(200);
      const publishAgain = await action('publish');
      expect(publishAgain.status).toBe(409);
      expect(publishAgain.body).toMatchObject({ success: false, code: 'MSG-08', message: PUBLISH_CONFLICT });
      const closed = await action('close');
      expect(closed.status).toBe(200);
      expect(closed.body.message).toBe('Đóng bài tập thành công.');
      const reopened = await action('reopen');
      expect(reopened.status).toBe(200);
      expect(reopened.body.message).toBe('Mở lại bài tập thành công.');
      expect(await notificationCount('Bài tập đã được mở lại')).toBe(2);
    });

    it('ITC-AS-006 - GV khác không xem/xóa được bài tập, GV chủ lớp xóa mềm được', async () => {
      const assignment = await newAssignment(c1.id, gvA.id, { status: 'DRAFT' });
      const detail = await call('get', `/assignments/${assignment.id}`, tokenB);
      expect(detail.status).toBe(404);
      expect(detail.body).toMatchObject({ success: false, message: NOT_FOUND_MESSAGE });
      const remove = await call('delete', `/assignments/${assignment.id}`, tokenB);
      expect(remove.status).toBe(404);
      expect(remove.body).toMatchObject({ success: false, message: NOT_FOUND_MESSAGE });

      const own = await call('delete', `/assignments/${assignment.id}`, tokenA);
      expect(own.status).toBe(200);
      expect(own.body.message).toBe('Xóa bài tập thành công.');
      const row = await TestDatabase.prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
      expect(row.deletedAt).not.toBeNull();
    });
  });

  describe('Danh sách, bài nộp và nhận xét', () => {
    it('ITC-AS-007 - Danh sách bài tập lọc theo lớp / loại / trạng thái / từ khóa', async () => {
      await newAssignment(c1.id, gvA.id, { title: 'Tuần nháp', kind: 'BONUS', status: 'DRAFT' });
      await newAssignment(c1.id, gvA.id, { title: 'Tuần đăng', kind: 'SOLO', status: 'PUBLISHED' });
      await newAssignment(c1.id, gvA.id, { title: 'Tuần đóng', kind: 'ENSEMBLE', status: 'CLOSED' });

      const published = await call('get', `/assignments?classId=${c1.id}&status=PUBLISHED`, tokenA);
      expect(published.status).toBe(200);
      expect(published.body.data.items).toHaveLength(1);

      expectValidation(await call('get', '/assignments?q=tuan&limit=101', tokenA), 'limit');
    });

    it('ITC-AS-008 - Đọc bài nộp của một sinh viên', async () => {
      const assignment = await newAssignment(c1.id, gvA.id, { status: 'PUBLISHED' });
      await TestDatabase.createSubmission(assignment.id, sv1.id, { accuracy: 60, submittedAt: new Date(Date.now() - 120_000) });
      await TestDatabase.createSubmission(assignment.id, sv1.id, { accuracy: 85, submittedAt: new Date(Date.now() - 60_000) });
      const outsider = await TestDatabase.createUser({ studentCode: 'SE9' });

      const response = await call('get', `/assignments/${assignment.id}/students/${sv1.id}/submissions`, tokenA);
      expect(response.status).toBe(200);
      expect(response.body.data.submissions).toHaveLength(2);
      expect(response.body.data.submissions.map((item: { accuracy: number }) => item.accuracy)).toEqual([85, 60]);
      expect(response.body.data.submissions.map((item: { attemptNumber: number }) => item.attemptNumber)).toEqual([2, 1]);

      const missing = await call('get', `/assignments/${assignment.id}/students/${outsider.id}/submissions`, tokenA);
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ success: false, message: 'Không tìm thấy sinh viên.' });
    });

    it('ITC-AS-009 - Gửi và sửa nhận xét, sinh viên nhận thông báo', async () => {
      const assignment = await newAssignment(c1.id, gvA.id);
      const submission = await TestDatabase.createSubmission(assignment.id, sv1.id);

      const first = await comment(submission.id, 'Giữ nhịp ổn, chú ý luyến láy ô nhịp 5.');
      expect(first.status).toBe(200);
      expect(first.body.message).toBe('Gửi nhận xét thành công.');
      const deliveries = await TestDatabase.prisma.userNotification.findMany({ where: { userId: sv1.id }, include: { notification: true } });
      expect(deliveries.map((item) => item.notification.title)).toEqual(['Giảng viên đã nhận xét bài nộp']);

      const second = await comment(submission.id, 'Sửa: chú ý ô nhịp 6.');
      expect(second.status).toBe(200);
      expect(second.body.message).toBe('Cập nhật nhận xét thành công.');

      expectValidation(await comment(submission.id, '   '), 'content', 'Nhận xét không được để trống.', 'MSG-35');
    });

    it('ITC-AS-010 - Không nhận xét được khi lớp đã kết thúc', async () => {
      const assignment = await newAssignment(c1.id, gvA.id);
      const submission = await TestDatabase.createSubmission(assignment.id, sv1.id);
      await TestDatabase.prisma.class.update({ where: { id: c1.id }, data: { status: 'ENDED' } });

      const response = await comment(submission.id, 'x');
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        code: 'MSG-08',
        message: 'Không thể nhận xét vì lớp đã kết thúc hoặc sinh viên không còn trong lớp.'
      });
    });
  });

  describe('Bài tập của sinh viên', () => {
    it('ITC-AS-011 - Sinh viên chỉ thấy bài đã đăng của lớp mình kèm trạng thái', async () => {
      const as1 = await newAssignment(c1.id, gvA.id, { status: 'PUBLISHED' });
      const as2 = await newAssignment(c1.id, gvA.id, { kind: 'BONUS', status: 'DRAFT' });
      const otherClass = await newClass(gvB);
      const as9 = await newAssignment(otherClass.id, gvB.id, { status: 'PUBLISHED' });
      await TestDatabase.createSubmission(as1.id, sv1.id, { accuracy: 85 });

      const list = await call('get', '/me/assignments', tokenSv1);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: as1.id, status: 'PASSED' });

      const notSubmitted = await call('get', '/me/assignments?status=NOT_SUBMITTED', tokenSv1);
      expect(notSubmitted.status).toBe(200);
      expect(notSubmitted.body.data).toHaveLength(0);

      for (const id of [as2.id, as9.id]) {
        const detail = await call('get', `/assignments/${id}`, tokenSv1);
        expect(detail.status).toBe(404);
        expect(detail.body).toMatchObject({ success: false, message: STUDENT_NOT_AVAILABLE });
      }
    });

    it('ITC-AS-012 - Cùng đường dẫn GET /assignments/:id phục vụ cả GV lẫn sinh viên', async () => {
      const assignment = await newAssignment(c1.id, gvA.id, { status: 'DRAFT' });
      const lecturer = await call('get', `/assignments/${assignment.id}`, tokenA);
      expect(lecturer.status).toBe(200);
      expect(lecturer.body.data.id).toBe(assignment.id);
      expect(lecturer.body.data.status).toBe('DRAFT');

      const adminResponse = await call('get', `/assignments/${assignment.id}`, tokenAdmin);
      expect(adminResponse.status).toBe(403);
      expect(adminResponse.body).toMatchObject({ success: false, message: FORBIDDEN_MESSAGE });
    });
  });

  describe('Tổng quan, nhóm bản nhạc và gán bài', () => {
    it('ITC-AS-013 - Tổng quan học kỳ hiện tại gồm lớp, bài tập và thống kê bản nhạc', async () => {
      const c2 = await newClass(gvA);
      await newAssignment(c1.id, gvA.id, { kind: 'SOLO', sheetMusicId: s1.id });
      await newAssignment(c1.id, gvA.id, { kind: 'BONUS' });
      await newAssignment(c2.id, gvA.id, { kind: 'SOLO', sheetMusicId: s1.id });

      const response = await call('get', '/assignments/overview', tokenA);
      expect(response.status).toBe(200);
      const { data } = response.body;
      expect(data.semester).toMatchObject({ name: 'CUR' });
      expect(data.emptyReason).toBeNull();
      expect(data.classes).toHaveLength(2);
      for (const item of data.classes) {
        expect(item).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String), status: expect.any(String), memberCount: expect.any(Number), assignments: expect.any(Array) }));
      }
      expect(data.classes.reduce((sum: number, item: { assignments: unknown[] }) => sum + item.assignments.length, 0)).toBe(3);
      expect(data.sheetStats.length).toBeGreaterThan(0);

      await TestDatabase.resetSemesters(TestDatabase.defaultSemesters());
      const empty = await call('get', '/assignments/overview', tokenA);
      expect(empty.status).toBe(200);
      expect(empty.body.data.semester).toBeNull();
      expect(empty.body.data.classes).toEqual([]);
      expect(empty.body.data.sheetStats).toEqual([]);
      expect(empty.body.data.emptyReason).toBeTruthy();
    });

    it('ITC-AS-014 - Chi tiết một bản nhạc dùng ở nhiều lớp', async () => {
      const c2 = await newClass(gvA);
      await newAssignment(c1.id, gvA.id, { kind: 'SOLO', sheetMusicId: s1.id });
      await newAssignment(c2.id, gvA.id, { kind: 'SOLO', sheetMusicId: s1.id });
      const unused = await newSheet();

      const response = await call('get', `/assignments/sheet-groups/${s1.id}`, tokenA);
      expect(response.status).toBe(200);
      expect(response.body.data.assignments).toHaveLength(2);
      for (const item of response.body.data.assignments) {
        for (const key of ['className', 'maxSubmissions', 'effectiveBpm', 'minAccuracy', 'publishedAt', 'createdBy']) expect(item).toHaveProperty(key);
      }

      const missing = await call('get', `/assignments/sheet-groups/${unused.id}`, tokenA);
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ success: false, message: SHEET_GROUP_NOT_FOUND });

      expectValidation(await call('get', '/assignments/sheet-groups/abc', tokenA), 'sheetMusicId');
    });

    it('ITC-AS-015 - Gán bài tập có sẵn sang lớp khác', async () => {
      const c2 = await newClass(gvA);
      const sv3 = await TestDatabase.createUser({ studentCode: 'SE3' });
      await TestDatabase.addMember(c2.id, sv3.id, gvA.id);
      const c9 = await newClass(gvB);
      const as1 = await newAssignment(c1.id, gvA.id, { kind: 'SOLO', sheetMusicId: s1.id });
      const gvbClass = await newClass(gvB);
      const asGvb = await newAssignment(gvbClass.id, gvB.id, { kind: 'BONUS' });

      const response = await call('post', '/assignments/assign', tokenA, { assignmentIds: [as1.id], classIds: [c2.id, c9.id] });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Gán bài tập thành công.');
      expect(response.body.data.created).toHaveLength(1);
      expect(response.body.data.created[0].classId).toBe(c2.id);
      expect(response.body.data.skipped.map((item: { classId: string }) => item.classId)).toContain(c9.id);
      const delivered = await TestDatabase.prisma.userNotification.findMany({ where: { userId: sv3.id }, include: { notification: true } });
      expect(delivered.map((item) => item.notification.title)).toEqual(['Bài tập mới']);

      const rows = await TestDatabase.prisma.assignment.findMany({ where: { classId: c2.id } });
      expect(rows.map((row) => row.status)).toEqual(['PUBLISHED']);

      const foreign = await call('post', '/assignments/assign', tokenA, { assignmentIds: [asGvb.id], classIds: [c2.id] });
      expect(foreign.status).toBe(404);
      expect(foreign.body).toMatchObject({ success: false, message: NOT_FOUND_MESSAGE });

      expectValidation(await call('post', '/assignments/assign', tokenA, { assignmentIds: [], classIds: [] }), 'assignmentIds');
    });

    it('ITC-AS-016 - Chọn bản nhạc cần đúng một trong lớp hoặc nhạc cụ', async () => {
      const byInstrument = await call('get', `/assignments/sheet-music?instrumentId=${tranh.id}`, tokenA);
      expect(byInstrument.status).toBe(200);
      expect(byInstrument.body.data.map((item: { id: string }) => item.id)).toContain(s1.id);

      for (const path of ['/assignments/sheet-music', `/assignments/sheet-music?classId=${c1.id}&instrumentId=${tranh.id}`]) {
        const response = await call('get', path, tokenA);
        expect(response.status).toBe(400);
        expect(response.body.errors[0].message).toBe('Cần chọn đúng một trong lớp hoặc nhạc cụ.');
      }
    });
  });

  describe('Kiểm tra bổ sung về bài tập', () => {
    it('ITC-AS-017 - Đóng rồi mở lại bài đã đăng', async () => {
      const a1 = await newAssignment(c1.id, gvA.id, { status: 'PUBLISHED' });
      const close = await call('post', `/assignments/${a1.id}/close`, tokenA);
      expect(close.status).toBe(200);
      expect(close.body.message).toBe('Đóng bài tập thành công.');
      expect(close.body.data.status).toBe('CLOSED');
      const reopen = await call('post', `/assignments/${a1.id}/reopen`, tokenA);
      expect(reopen.status).toBe(200);
      expect(reopen.body.message).toBe('Mở lại bài tập thành công.');
      expect(reopen.body.data.status).toBe('PUBLISHED');

      const inbox = await call('get', '/me/notifications', tokenSv1);
      expect(inbox.status).toBe(200);
      const titles = JSON.stringify(inbox.body.data);
      expect(titles).toContain('Bài tập đã được mở lại');
      expect(titles).not.toContain('đóng');
    });

    it('ITC-AS-018 - Sửa bài đã đăng tạo phiên bản mới và báo cho lớp', async () => {
      const a1 = await newAssignment(c1.id, gvA.id, { title: 'Tuần 4', status: 'PUBLISHED' });
      const body = { title: 'Tuần 4 (sửa)', kind: 'SOLO' };

      const first = await call('put', `/assignments/${a1.id}`, tokenA, body);
      expect(first.status).toBe(200);
      expect(first.body.message).toBe('Cập nhật bài tập thành công.');
      expect(await notificationCount('Bài tập đã được cập nhật')).toBe(2);

      const second = await call('put', `/assignments/${a1.id}`, tokenA, body);
      expect(second.status).toBe(200);
      expect(await notificationCount('Bài tập đã được cập nhật')).toBe(2);
      expect(await TestDatabase.prisma.assignmentVersion.count({ where: { assignmentId: a1.id } })).toBe(2);
    });

    it('ITC-AS-019 - Xóa bài tập', async () => {
      const a2 = await newAssignment(c1.id, gvA.id, { status: 'PUBLISHED' });
      const removed = await call('delete', `/assignments/${a2.id}`, tokenA);
      expect(removed.status).toBe(200);
      expect(removed.body.message).toBe('Xóa bài tập thành công.');

      const detail = await call('get', `/assignments/${a2.id}`, tokenA);
      expect(detail.status).toBe(404);
      expect(detail.body.message).toBe(NOT_FOUND_MESSAGE);

      const list = await call('get', '/me/assignments', tokenSv1);
      expect(list.status).toBe(200);
      expect(list.body.data.map((item: { id: string }) => item.id)).not.toContain(a2.id);
    });

    it('ITC-AS-020 - Quy tắc về chữ và BPM', async () => {
      expectValidation(await create({ classId: c1.id, title: '', kind: 'SOLO' }), 'title', 'Tiêu đề không được để trống.');
      expectValidation(await create({ classId: c1.id, title: 'T', kind: 'SOLO', description: 'a'.repeat(1001) }), 'description', 'Mô tả không được vượt quá 1000 ký tự.');
      expectValidation(await create({ classId: c1.id, title: 'T', kind: 'SOLO', requiredBpm: 2.5 }), 'requiredBpm', BPM_MESSAGE);
    });

    it('ITC-AS-021 - Lớp chỉ có một bài Hòa tấu nhưng nhiều bài Thưởng', async () => {
      await newAssignment(c1.id, gvA.id, { kind: 'ENSEMBLE' });
      const ensemble = await create({ classId: c1.id, title: 'Hòa tấu 2', kind: 'ENSEMBLE' });
      expect(ensemble.status).toBe(409);
      expect(ensemble.body.field).toBe('kind');
      expect(ensemble.body.message).toBe('Không thể lưu bài tập vì lớp đã có bài Hòa tấu.');

      for (const title of ['Thưởng 1', 'Thưởng 2']) {
        const bonus = await create({ classId: c1.id, title, kind: 'BONUS' });
        expect(bonus.status).toBe(201);
        expect(bonus.body.message).toBe('Tạo bài tập thành công.');
      }
    });

    it('ITC-AS-022 - Quy tắc nhận xét', async () => {
      const assignment = await newAssignment(c1.id, gvA.id);
      const submission = await TestDatabase.createSubmission(assignment.id, sv1.id);

      const empty = await comment(submission.id, '');
      expect(empty.status).toBe(400);
      expect(empty.body.message === 'Nhận xét không được để trống.' || empty.body.errors?.[0]?.message === 'Nhận xét không được để trống.').toBe(true);
      const tooLong = await comment(submission.id, 'x'.repeat(2001));
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.message === 'Nhận xét không được vượt quá 2000 ký tự.' || tooLong.body.errors?.[0]?.message === 'Nhận xét không được vượt quá 2000 ký tự.').toBe(true);
      const missing = await comment('no-such-id', 'Nhận xét hợp lệ');
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('Không tìm thấy bài nộp.');
    });

    it('ITC-AS-023 - Nhóm bản nhạc không tồn tại', async () => {
      expectValidation(await call('get', '/assignments/sheet-groups/abc', tokenA), 'sheetMusicId');
      const unused = await newSheet();
      const response = await call('get', `/assignments/sheet-groups/${unused.id}`, tokenA);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe(SHEET_GROUP_NOT_FOUND);
    });

    it('ITC-AS-024 - Body gán bài và các lớp bị bỏ qua', async () => {
      expectValidation(await call('post', '/assignments/assign', tokenA, { assignmentIds: [], classIds: [c1.id] }), 'assignmentIds');
      const manyClasses = Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
      expectValidation(await call('post', '/assignments/assign', tokenA, { assignmentIds: [MISSING_ID], classIds: manyClasses }), 'classIds');

      const c2 = await newClass(gvA);
      const c3 = await newClass(gvA);
      await newAssignment(c1.id, gvA.id, { title: 'Độc tấu lớp 1', kind: 'SOLO' });
      const source = await newAssignment(c3.id, gvA.id, { title: 'Độc tấu nguồn', kind: 'SOLO' });
      const response = await call('post', '/assignments/assign', tokenA, { assignmentIds: [source.id], classIds: [c1.id, c2.id] });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Gán bài tập thành công.');
      expect(response.body.data.created.map((item: { classId: string }) => item.classId)).toEqual([c2.id]);
      expect(response.body.data.skipped.map((item: { classId: string }) => item.classId)).toEqual([c1.id]);
    });

    it('ITC-AS-025 - Truy vấn danh sách được kiểm tra hợp lệ', async () => {
      expectValidation(await call('get', '/assignments?limit=101', tokenA), 'limit');
      const longQuery = await call('get', `/assignments?q=${'a'.repeat(101)}`, tokenA);
      expect(longQuery.status).toBe(400);
      expect(longQuery.body.errors[0].message).toBe('Từ khóa tìm kiếm không được vượt quá 100 ký tự.');
      expectValidation(await call('get', '/assignments?status=ARCHIVED', tokenA), 'status');
    });

    it('ITC-AS-026 - Sinh viên, Admin và khách không dùng được API giảng viên', async () => {
      const a1 = await newAssignment(c1.id, gvA.id, { status: 'PUBLISHED' });
      const student = await create({ classId: c1.id, title: 'T', kind: 'SOLO' }, tokenSv1);
      expect(student.status).toBe(403);
      expect(student.body.message).toBe(FORBIDDEN_MESSAGE);
      const adminResponse = await call('post', `/assignments/${a1.id}/close`, tokenAdmin);
      expect(adminResponse.status).toBe(403);
      expect(adminResponse.body.message).toBe(FORBIDDEN_MESSAGE);
      const guest = await call('get', '/assignments/overview');
      expect(guest.status).toBe(401);
      expect(guest.body.message).toBe('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    });

    it('ITC-AS-027 - Sinh viên không mở được bài nháp hoặc bài của lớp khác', async () => {
      const draft = await newAssignment(c1.id, gvA.id, { status: 'DRAFT' });
      const otherClass = await newClass(gvB);
      const other = await newAssignment(otherClass.id, gvB.id, { status: 'PUBLISHED' });
      for (const id of [draft.id, other.id]) {
        const response = await call('get', `/assignments/${id}`, tokenSv1);
        expect(response.status).toBe(404);
        expect(response.body.message).toBe(STUDENT_NOT_AVAILABLE);
      }
    });

    it('ITC-AS-028 - Kết thúc lớp thì các bài đã đăng chuyển sang đóng', async () => {
      const c3 = await newClass(gvA);
      const published = await newAssignment(c3.id, gvA.id, { kind: 'SOLO', status: 'PUBLISHED' });
      const draft = await newAssignment(c3.id, gvA.id, { kind: 'BONUS', status: 'DRAFT' });

      const ended = await call('post', `/classes/${c3.id}/end`, tokenA);
      expect(ended.status).toBe(200);
      const list = await call('get', `/assignments?classId=${c3.id}`, tokenA);
      expect(list.status).toBe(200);
      const byId = Object.fromEntries(list.body.data.items.map((item: { id: string; status: string }) => [item.id, item.status]));
      expect(byId[published.id]).toBe('CLOSED');
      expect(byId[draft.id]).toBe('DRAFT');
    });

    it('ITC-AS-029 - Bài tập của lớp đã kết thúc không sửa được', async () => {
      const c3 = await newClass(gvA);
      const assignment = await newAssignment(c3.id, gvA.id, { status: 'PUBLISHED' });
      await call('post', `/classes/${c3.id}/end`, tokenA).expect(200);

      const responses = [
        await call('put', `/assignments/${assignment.id}`, tokenA, { title: 'Tên mới', kind: 'SOLO' }),
        await call('delete', `/assignments/${assignment.id}`, tokenA),
        await call('post', `/assignments/${assignment.id}/reopen`, tokenA)
      ];
      for (const response of responses) {
        expect(response.status).toBe(409);
        expect(response.body.message).toBe(ENDED_CLASS_MESSAGE);
      }
    });

    it('ITC-AS-030 - Bài nháp không đóng được, bài đã đăng không mở lại hay đăng lại được', async () => {
      const draft = await newAssignment(c1.id, gvA.id, { kind: 'BONUS', status: 'DRAFT' });
      const a1 = await newAssignment(c1.id, gvA.id, { kind: 'SOLO', status: 'PUBLISHED' });

      const close = await call('post', `/assignments/${draft.id}/close`, tokenA);
      expect(close.status).toBe(409);
      expect(close.body.message).toBe(CLOSE_CONFLICT);
      const reopen = await call('post', `/assignments/${a1.id}/reopen`, tokenA);
      expect(reopen.status).toBe(409);
      expect(reopen.body.message).toBe(REOPEN_CONFLICT);
      const publish = await call('post', `/assignments/${a1.id}/publish`, tokenA);
      expect(publish.status).toBe(409);
      expect(publish.body.message).toBe(PUBLISH_CONFLICT);
    });
  });
});
