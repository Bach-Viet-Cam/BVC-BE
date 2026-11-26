import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const VALIDATION_MESSAGE = 'Kiểm tra lại dữ liệu gửi đi';

describe('Theo dõi tiến độ sinh viên (UC-12)', () => {
  let gvA: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let gvB: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let gvAToken: string;
  let gvBToken: string;
  let classC1: Awaited<ReturnType<typeof TestDatabase.createClass>>;
  let instrumentId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    await TestDatabase.resetGradingSettings(70, 10);
    gvA = await TestDatabase.createLecturer();
    gvB = await TestDatabase.createLecturer();
    gvAToken = TestDatabase.tokenFor(gvA);
    gvBToken = TestDatabase.tokenFor(gvB);
    instrumentId = (await TestDatabase.createInstrument('Đàn tranh')).id;
    classC1 = await TestDatabase.createClass(gvA.id, instrumentId, { name: 'C1', startDate: TestDatabase.futureDate(-20) });
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  const get = (path: string, token: string = gvAToken) => request(app).get(path).set('Authorization', token);
  const classPath = (path: string) => `/api/v1/classes/${classC1.id}${path}`;
  const daysAgo = (days: number, hourUtc = 3) => {
    const date = new Date(Date.now() - days * 86400000);
    date.setUTCHours(hourUtc, 0, 0, 0);
    return date;
  };

  async function member(name: string, code: string) {
    const student = await TestDatabase.createUser({ username: name, studentCode: code });
    await TestDatabase.addMember(classC1.id, student.id, gvA.id);
    return student;
  }

  describe('Tiến độ lớp học', () => {
    it('ITC-PV-001 - Bảng tiến độ lớp với trạng thái theo ngưỡng', async () => {
      const as1 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const sv1 = await member('SV Một', 'SE001');
      const sv2 = await member('SV Hai', 'SE002');
      await member('SV Ba', 'SE003');
      await TestDatabase.createSubmission(as1.id, sv1.id, { accuracy: 85 });
      await TestDatabase.createSubmission(as1.id, sv2.id, { accuracy: 65 });

      const owned = await get('/api/v1/classes/owned');
      expect(owned.status).toBe(200);
      expect(JSON.stringify(owned.body.data)).toContain(classC1.id);

      const progress = await get(classPath('/progress'));
      expect(progress.status).toBe(200);
      const rows = progress.body.data.items as Array<{ studentCode: string; status: string | null }>;
      expect(rows.map((row) => [row.studentCode, row.status])).toEqual([
        ['SE001', 'ON_TRACK'],
        ['SE002', 'AT_RISK'],
        ['SE003', null]
      ]);

      const atRisk = await get(classPath('/progress?status=AT_RISK'));
      expect(atRisk.status).toBe(200);
      expect(atRisk.body.data.items.map((row: { studentCode: string }) => row.studentCode)).toEqual(['SE002']);

      const invalid = await get(classPath('/progress?sortBy=email'));
      expect(invalid.status).toBe(400);
      expect(invalid.body).toMatchObject({ success: false, field: 'sortBy', message: VALIDATION_MESSAGE });
      expect(invalid.body.errors[0].field).toBe('sortBy');
      expect(invalid.body.code).toBeUndefined();
    });

    it('ITC-PV-002 - Giảng viên khác và sinh viên không xem được tiến độ lớp', async () => {
      const sv1 = await member('SV Một', 'SE001');

      const other = await get(classPath('/progress'), gvBToken);
      expect(other.status).toBe(403);
      expect(other.body).toMatchObject({ success: false, message: 'Bạn chỉ có thể xem dữ liệu của lớp mình phụ trách.' });

      const student = await get(classPath('/progress'), TestDatabase.tokenFor(sv1));
      expect(student.status).toBe(403);
      expect(student.body).toMatchObject({ success: false, message: 'Bạn không có quyền truy cập chức năng này.' });
    });
  });

  describe('Tóm tắt và lịch sử của một sinh viên', () => {
    it('ITC-PV-003 - Tóm tắt có 6 tuần và số buổi tập 7 ngày gần nhất', async () => {
      const as1 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const as2 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const sv1 = await member('SV Một', 'SE001');
      await TestDatabase.createSubmission(as1.id, sv1.id, { accuracy: 80, submittedAt: daysAgo(19) });
      await TestDatabase.createSubmission(as2.id, sv1.id, { accuracy: 60, submittedAt: daysAgo(5) });
      for (const days of [2, 1]) await TestDatabase.createSubmission(as1.id, sv1.id, { status: 'FAILED', submittedAt: daysAgo(days) });
      for (let index = 0; index < 8; index += 1) await TestDatabase.createSubmission(as1.id, sv1.id, { status: 'FAILED', submittedAt: daysAgo(10 + index * 0.1) });

      const response = await get(classPath(`/students/${sv1.id}/summary`));
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ average: 70, status: 'ON_TRACK', minAccuracy: 70, totalSessions: 12, sessionsLast7Days: 3 });
      expect(response.body.data.weekly).toHaveLength(6);
      expect(response.body.data.weekly[0].average).toBe(80);
      expect(response.body.data.weekly[2].average).toBe(60);
    });

    it('ITC-PV-004 - Sinh viên chỉ xem dữ liệu của mình khi còn trong lớp', async () => {
      const sv1 = await member('SV Một', 'SE001');
      const sv2 = await member('SV Hai', 'SE002');
      const sv1Token = TestDatabase.tokenFor(sv1);
      const path = classPath(`/students/${sv1.id}/summary`);

      expect((await get(path, sv1Token)).status).toBe(200);

      const other = await get(path, TestDatabase.tokenFor(sv2));
      expect(other.status).toBe(404);
      expect(other.body).toMatchObject({ success: false, message: 'Không tìm thấy sinh viên.' });

      await TestDatabase.prisma.classMember.updateMany({ where: { classId: classC1.id, userId: sv1.id }, data: { removedAt: new Date() } });
      const removed = await get(path, sv1Token);
      expect(removed.status).toBe(404);
      expect(removed.body).toMatchObject({ success: false, message: 'Không tìm thấy lớp học.' });
    });

    it('ITC-PV-005 - Giảng viên vẫn xem được thành viên cũ có bài nộp', async () => {
      const as1 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const sv2 = await TestDatabase.createUser({ username: 'SV Hai', studentCode: 'SE002' });
      const membership = await TestDatabase.addMember(classC1.id, sv2.id, gvA.id);
      await TestDatabase.createSubmission(as1.id, sv2.id, { accuracy: 75 });
      await TestDatabase.prisma.classMember.update({ where: { id: membership.id }, data: { removedAt: new Date() } });
      const sv9 = await TestDatabase.createUser({ username: 'SV Chín', studentCode: 'SE009' });

      expect((await get(classPath(`/students/${sv2.id}/summary`))).status).toBe(200);

      const never = await get(classPath(`/students/${sv9.id}/summary`));
      expect(never.status).toBe(404);
      expect(never.body).toMatchObject({ success: false, message: 'Không tìm thấy sinh viên.' });
    });

    it('ITC-PV-006 - Lịch sử lọc theo ngày Việt Nam và phân trang', async () => {
      const as1 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const sv1 = await member('SV Một', 'SE001');
      await TestDatabase.createSubmission(as1.id, sv1.id, { submittedAt: new Date('2026-10-06T17:30:00Z') });
      await TestDatabase.createSubmission(as1.id, sv1.id, { submittedAt: new Date('2026-10-08T03:00:00Z') });
      const history = (query: string) => get(classPath(`/students/${sv1.id}/history?${query}`));

      const day = await history('from=2026-10-07&to=2026-10-07');
      expect(day.status).toBe(200);
      expect(day.body.data.items).toHaveLength(1);

      const reversed = await history('from=2026-10-31&to=2026-10-01');
      expect(reversed.status).toBe(400);
      expect(reversed.body).toMatchObject({ success: false, code: 'MSG-04', field: 'from', message: 'Từ ngày không được sau đến ngày.' });

      const badDate = await history('from=2026-02-30');
      expect(badDate.status).toBe(400);
      expect(badDate.body).toMatchObject({ success: false, field: 'from', message: VALIDATION_MESSAGE });
      expect(badDate.body.errors[0]).toMatchObject({ field: 'from', message: 'Ngày không hợp lệ.' });
      expect(badDate.body.code).toBeUndefined();

      const badLimit = await history('limit=201');
      expect(badLimit.status).toBe(400);
      expect(badLimit.body).toMatchObject({ success: false, field: 'limit', message: VALIDATION_MESSAGE });
      expect(badLimit.body.errors[0].field).toBe('limit');
      expect(badLimit.body.code).toBeUndefined();
    });
  });

  describe('Kiểm tra tiến độ bổ sung', () => {
    it('ITC-PV-007 - Bộ lọc và sắp xếp bảng tiến độ', async () => {
      const as1 = await TestDatabase.createAssignment(classC1.id, gvA.id);
      const onTrack = await member('An Giỏi', 'SE001');
      const atRisk = await member('Bình Trung', 'SE002');
      const behind = await member('Cường Yếu', 'SE003');
      await TestDatabase.createSubmission(as1.id, onTrack.id, { accuracy: 85 });
      await TestDatabase.createSubmission(as1.id, atRisk.id, { accuracy: 65 });
      await TestDatabase.createSubmission(as1.id, behind.id, { accuracy: 30 });
      const codes = (response: request.Response) => response.body.data.items.map((row: { studentCode: string }) => row.studentCode);

      const byStatus = await get(classPath('/progress?status=AT_RISK'));
      expect(byStatus.status).toBe(200);
      expect(codes(byStatus)).toEqual(['SE002']);

      const byName = await get(classPath(`/progress?q=${encodeURIComponent('Cường')}`));
      expect(byName.status).toBe(200);
      expect(codes(byName)).toEqual(['SE003']);

      const sorted = await get(classPath('/progress?sortBy=averageAccuracy&sortDir=desc'));
      expect(sorted.status).toBe(200);
      expect(codes(sorted)).toEqual(['SE001', 'SE002', 'SE003']);
    });

    it('ITC-PV-008 - Giá trị query sai của bảng tiến độ', async () => {
      for (const query of ['status=DONE', 'sortBy=email', `q=${'a'.repeat(101)}`]) {
        const response = await get(classPath(`/progress?${query}`));
        expect(response.status).toBe(400);
        expect(response.body.message).toBe(VALIDATION_MESSAGE);
      }
    });

    it('ITC-PV-009 - Danh sách lớp cho màn hình tiến độ', async () => {
      const classB = await TestDatabase.createClass(gvB.id, instrumentId, { name: 'CB' });

      const own = await get('/api/v1/classes/owned');
      expect(own.status).toBe(200);
      const ownIds = JSON.stringify(own.body.data);
      expect(ownIds).toContain(classC1.id);
      expect(ownIds).not.toContain(classB.id);

      const other = await get('/api/v1/classes/owned', gvBToken);
      expect(other.status).toBe(200);
      expect(JSON.stringify(other.body.data)).not.toContain(classC1.id);
    });

    it('ITC-PV-010 - Lớp không tồn tại', async () => {
      const response = await get('/api/v1/classes/no-such-class/progress');
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Không tìm thấy lớp học.');
    });

    it('ITC-PV-011 - Bộ lọc ngày của lịch sử', async () => {
      const sv1 = await member('SV Một', 'SE001');
      const history = (query: string) => get(classPath(`/students/${sv1.id}/history?${query}`));

      const reversed = await history('from=2026-11-10&to=2026-11-01');
      expect(reversed.status).toBe(400);
      expect(reversed.body.message).toBe('Từ ngày không được sau đến ngày.');

      const badMonth = await history('from=2026-13-01');
      expect(badMonth.status).toBe(400);
      expect(badMonth.body.errors[0]).toMatchObject({ field: 'from', message: 'Ngày không hợp lệ.' });

      const badLimit = await history('limit=1000');
      expect(badLimit.status).toBe(400);
      expect(badLimit.body.field).toBe('limit');
    });

    it('ITC-PV-012 - Sinh viên không tồn tại trong phần tóm tắt', async () => {
      const unknown = await get(classPath('/students/6f1c2f0e-5b1d-4c53-9d7e-1a2b3c4d5e6f/summary'));
      expect(unknown.status).toBe(404);
      expect(unknown.body.message).toBe('Không tìm thấy sinh viên.');

      const malformed = await get(classPath('/students/abc/summary'));
      expect(malformed.status).toBe(400);
      expect(malformed.body.field).toBe('studentId');
    });
  });
});
