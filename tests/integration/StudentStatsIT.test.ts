import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const FORBIDDEN = 'Bạn không có quyền thực hiện thao tác này.';
const UNAUTHORIZED = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
const UNKNOWN_UUID = '6f1c2f0e-5b1d-4c53-9d7e-1a2b3c4d5e6f';

describe('Thống kê sinh viên và đánh giá tổng quan của giảng viên', () => {
  let gvA: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let gvB: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let gvAToken: string;
  let gvBToken: string;
  let sv1: Awaited<ReturnType<typeof TestDatabase.createUser>>;
  let sv1Token: string;
  let classC1: Awaited<ReturnType<typeof TestDatabase.createClass>>;
  let instrumentId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    gvA = await TestDatabase.createLecturer();
    gvB = await TestDatabase.createLecturer();
    gvAToken = TestDatabase.tokenFor(gvA);
    gvBToken = TestDatabase.tokenFor(gvB);
    instrumentId = (await TestDatabase.createInstrument('Đàn tranh')).id;
    classC1 = await TestDatabase.createClass(gvA.id, instrumentId, { name: 'C1', startDate: TestDatabase.futureDate(-10) });
    sv1 = await TestDatabase.createUser({ username: 'SV Một', studentCode: 'SE001' });
    sv1Token = TestDatabase.tokenFor(sv1);
    await TestDatabase.addMember(classC1.id, sv1.id, gvA.id);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const statsPath = (classId: string, studentId: string) => `/api/v1/classes/${classId}/students/${studentId}/stats`;
  const evaluationPath = (classId: string, studentId: string) => `/api/v1/classes/${classId}/students/${studentId}/evaluation`;
  const getStats = (classId: string, studentId: string, token: string = gvAToken) => request(app).get(statsPath(classId, studentId)).set('Authorization', token);
  const putEvaluation = (classId: string, studentId: string, content: string, token: string = gvAToken) =>
    request(app).put(evaluationPath(classId, studentId)).set('Authorization', token).send({ content });
  const getMine = (query: string = '', token: string = sv1Token) => request(app).get(`/api/v1/me/stats${query}`).set('Authorization', token);

  async function endedClassWithSv1() {
    const endedClass = await TestDatabase.createClass(gvA.id, instrumentId, { name: 'C2', startDate: TestDatabase.futureDate(-60), status: 'ENDED' });
    await TestDatabase.addMember(endedClass.id, sv1.id, gvA.id);
    return endedClass;
  }

  describe('Giảng viên xem và đánh giá', () => {
    it('ITC-ST-001 - Giảng viên của lớp xem thống kê một sinh viên', async () => {
      const as1 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const as2 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      await TestDatabase.createSubmission(as1.id, sv1.id, { accuracy: 80 });
      await TestDatabase.createSubmission(as2.id, sv1.id, { accuracy: 60 });

      const response = await getStats(classC1.id, sv1.id);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        student: { id: sv1.id, fullName: 'SV Một', studentCode: 'SE001' },
        class: { id: classC1.id, name: 'C1', cohort: 'FA26', status: 'ACTIVE' },
        evaluation: null,
        canEvaluate: true
      });
      expect(response.body.data.assignments).toHaveLength(2);
    });

    it('ITC-ST-002 - Không hiển thị thống kê khi sai sinh viên, lớp hoặc vai trò', async () => {
      const sv9 = await TestDatabase.createUser({ username: 'SV Chín', studentCode: 'SE009' });

      const never = await getStats(classC1.id, sv9.id);
      expect(never.status).toBe(404);
      expect(never.body).toMatchObject({ success: false, message: 'Không tìm thấy sinh viên.' });

      const otherLecturer = await getStats(classC1.id, sv1.id, gvBToken);
      expect(otherLecturer.status).toBe(404);

      const malformed = await getStats(classC1.id, 'abc');
      expect(malformed.status).toBe(400);
      expect(malformed.body.field).toBe('studentId');

      const student = await getStats(classC1.id, sv1.id, sv1Token);
      expect(student.status).toBe(403);
      expect(student.body).toMatchObject({ success: false, message: FORBIDDEN });
    });

    it('ITC-ST-003 - Giảng viên lưu đánh giá tổng quan và lưu lại thì ghi đè', async () => {
      const first = await putEvaluation(classC1.id, sv1.id, 'Tiến bộ tốt');
      expect(first.status).toBe(200);
      expect(first.body.message).toBe('Đã lưu đánh giá.');
      expect(first.body.data.evaluation).toMatchObject({ content: 'Tiến bộ tốt' });
      expect(first.body.data.evaluation.lecturerName).toBeDefined();
      expect(first.body.data.evaluation.updatedAt).toBeDefined();

      const second = await putEvaluation(classC1.id, sv1.id, 'Cần luyện thêm tuần 5');
      expect(second.status).toBe(200);

      const rows = await TestDatabase.prisma.studentEvaluation.findMany({ where: { classId: classC1.id, studentId: sv1.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('Cần luyện thêm tuần 5');

      const stats = await getStats(classC1.id, sv1.id);
      expect(stats.status).toBe(200);
      expect(stats.body.data.evaluation.content).toBe('Cần luyện thêm tuần 5');
    });

    it('ITC-ST-004 - Nội dung đánh giá không rỗng và tối đa 2000 ký tự', async () => {
      const blank = await putEvaluation(classC1.id, sv1.id, '   ');
      expect(blank.status).toBe(400);
      expect(blank.body.field).toBe('content');
      expect(blank.body.errors[0].message).toBe('Đánh giá không được để trống.');

      const tooLong = await putEvaluation(classC1.id, sv1.id, 'a'.repeat(2001));
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.field).toBe('content');
      expect(tooLong.body.errors[0].message).toBe('Đánh giá không được vượt quá 2000 ký tự.');

      const maxLength = await putEvaluation(classC1.id, sv1.id, 'a'.repeat(2000));
      expect(maxLength.status).toBe(200);
    });

    it('ITC-ST-005 - Khóa đánh giá khi lớp đã kết thúc hoặc sinh viên đã rời lớp', async () => {
      const endedClass = await endedClassWithSv1();
      const as1 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const sv2 = await TestDatabase.createUser({ username: 'SV Hai', studentCode: 'SE002' });
      const membership = await TestDatabase.addMember(classC1.id, sv2.id, gvA.id);
      await TestDatabase.createSubmission(as1.id, sv2.id, { accuracy: 70 });
      await TestDatabase.prisma.classMember.update({ where: { id: membership.id }, data: { removedAt: new Date() } });
      const message = 'Không thể đánh giá vì lớp đã kết thúc hoặc sinh viên không còn trong lớp.';

      const ended = await putEvaluation(endedClass.id, sv1.id, 'Tốt');
      expect(ended.status).toBe(409);
      expect(ended.body).toMatchObject({ success: false, code: 'MSG-08', message });

      const left = await putEvaluation(classC1.id, sv2.id, 'Tốt');
      expect(left.status).toBe(409);
      expect(left.body.message).toBe(message);

      const stats = await getStats(classC1.id, sv2.id);
      expect(stats.status).toBe(200);
      expect(stats.body.data.canEvaluate).toBe(false);
    });
  });

  describe('Góc nhìn sinh viên', () => {
    it('ITC-ST-006 - Sinh viên xem thống kê của mình, lớp đang học mới nhất được chọn trước', async () => {
      const endedClass = await endedClassWithSv1();
      const svNew = await TestDatabase.createUser({ username: 'SV Mới', studentCode: 'SE100' });
      const classC9 = await TestDatabase.createClass(gvB.id, instrumentId, { name: 'C9' });

      const own = await getMine();
      expect(own.status).toBe(200);
      expect(own.body.data.class.id).toBe(classC1.id);
      expect(own.body.data.canEvaluate).toBe(false);
      const listed = (own.body.data.classes as Array<{ id: string }>).map((item) => item.id);
      expect(listed).toEqual([classC1.id, endedClass.id]);

      const picked = await getMine(`?classId=${endedClass.id}`);
      expect(picked.status).toBe(200);
      expect(picked.body.data.class.id).toBe(endedClass.id);

      const notMember = await getMine(`?classId=${classC9.id}`);
      expect(notMember.status).toBe(404);
      expect(notMember.body).toMatchObject({ success: false, message: 'Không tìm thấy lớp học.' });

      const fresh = await getMine('', TestDatabase.tokenFor(svNew));
      expect(fresh.status).toBe(200);
      expect(fresh.body.data).toBeNull();
    });

    it('ITC-ST-007 - Chỉ sinh viên dùng được API thống kê của tôi', async () => {
      const lecturer = await getMine('', gvAToken);
      expect(lecturer.status).toBe(403);
      expect(lecturer.body).toMatchObject({ success: false, message: FORBIDDEN });

      const guest = await request(app).get('/api/v1/me/stats');
      expect(guest.status).toBe(401);
      expect(guest.body).toMatchObject({ success: false, message: UNAUTHORIZED });
    });
  });

  describe('Kiểm tra thống kê bổ sung', () => {
    it('ITC-ST-008 - Mã sinh viên sai hoặc không tồn tại', async () => {
      const malformed = await getStats(classC1.id, 'abc');
      expect(malformed.status).toBe(400);
      expect(malformed.body.field).toBe('studentId');

      const unknown = await getStats(classC1.id, UNKNOWN_UUID);
      expect(unknown.status).toBe(404);
      expect(unknown.body.message).toBe('Không tìm thấy sinh viên.');
    });

    it('ITC-ST-009 - Sinh viên yêu cầu lớp mà mình không thuộc', async () => {
      const otherClass = await TestDatabase.createClass(gvA.id, instrumentId, { name: 'C2', status: 'ENDED' });

      const response = await getMine(`?classId=${otherClass.id}`);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Không tìm thấy lớp học.');
    });

    it('ITC-ST-010 - Admin và khách gọi API thống kê của giảng viên', async () => {
      const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });

      const asAdmin = await getStats(classC1.id, sv1.id, TestDatabase.tokenFor(admin));
      expect(asAdmin.status).toBe(403);
      expect(asAdmin.body.message).toBe(FORBIDDEN);

      const guest = await request(app).get(statsPath(classC1.id, sv1.id));
      expect(guest.status).toBe(401);
      expect(guest.body.message).toBe(UNAUTHORIZED);
    });
  });
});
