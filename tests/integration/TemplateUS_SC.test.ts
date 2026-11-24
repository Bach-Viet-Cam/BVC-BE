import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

type ConfigSeed = {
  key: string;
  value: string;
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  group: 'FILE_LIMIT' | 'SCORING' | 'PRACTICE_RULE';
  label: string;
};

const seedConfig = (seed: ConfigSeed) => TestDatabase.prisma.systemConfig.create({ data: seed });

describe('Template US/SC integration (Platform + Storage)', () => {
  let adminToken: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  // ITC-US-001 - chỉ Admin dùng được /api/v1/users
  it('ITC-US-001 - chỉ Admin truy cập được /api/v1/users', async () => {
    const guest = await request(app).get('/api/v1/users');
    expect(guest.status).toBe(401);
    expect(guest.body.message).toBe('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

    const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    const teacher = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    for (const user of [student, teacher]) {
      const forbidden = await request(app).get('/api/v1/users').set('Authorization', TestDatabase.tokenFor(user));
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.message).toBe('Bạn không có quyền truy cập chức năng này.');
    }

    const allowed = await request(app).get('/api/v1/users').set('Authorization', adminToken);
    expect(allowed.status).toBe(200);
  });

  // ITC-US-007 - không đổi role của giảng viên đang phụ trách lớp ACTIVE
  it('ITC-US-007 - chặn đổi role của giảng viên đang phụ trách lớp ACTIVE', async () => {
    const teacher = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    const instrument = await TestDatabase.createInstrument();
    await TestDatabase.createClass(teacher.id, instrument.id, { status: 'ACTIVE' });

    const response = await request(app)
      .patch(`/api/v1/users/${teacher.id}`)
      .set('Authorization', adminToken)
      .send({ role: TestDatabase.roles.STUDENT });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Không thể đổi vai trò của giảng viên đang phụ trách lớp học.');
    expect((await TestDatabase.prisma.user.findUniqueOrThrow({ where: { id: teacher.id } })).role)
      .toBe(TestDatabase.roles.TEACHER);
  });

  // ITC-US-008 - sau khi đã đăng nhập (lastLoginAt != null) thì không đổi email được
  it('ITC-US-008 - chặn đổi email sau khi tài khoản đã đăng nhập', async () => {
    const target = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    await TestDatabase.prisma.user.update({ where: { id: target.id }, data: { lastLoginAt: new Date() } });

    const response = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', adminToken)
      .send({ email: 'changed.008@fpt.edu.vn' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Không thể đổi email sau khi tài khoản đã đăng nhập.');
    expect((await TestDatabase.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).email).toBe(target.email);
  });

  // ITC-US-010 - import thật tạo account; rows rỗng / quá 1000 bị chặn
  it('ITC-US-010 - import thật tạo tài khoản và chặn rows rỗng hoặc quá 1000', async () => {
    const row = { rowNumber: 1, studentCode: 'SE910', username: 'Sinh viên import 010', email: 'import.010@fpt.edu.vn' };

    const created = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({ rows: [row], mode: 'skip', dryRun: false });
    expect(created.status).toBe(200);
    expect(created.body.message).toBe('Import hoàn tất.');
    expect(created.body.data).toMatchObject({ dryRun: false, createdCount: 1, updatedCount: 0 });
    expect(await TestDatabase.prisma.user.count({ where: { email: row.email } })).toBe(1);

    const empty = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({ rows: [], mode: 'skip', dryRun: false });
    expect(empty.status).toBe(400);
    expect(empty.body.field).toBe('rows');
    expect(empty.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'rows' })]));

    const tooMany = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({
        rows: Array.from({ length: 1001 }, (_, index) => ({ ...row, rowNumber: index + 1 })),
        mode: 'skip',
        dryRun: false
      });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.field).toBe('rows');
    expect(tooMany.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'rows' })]));
  });

  // ITC-US-011 - validate POST /users: email/role/username/studentCode
  it('ITC-US-011 - POST /users validate email, role, username, studentCode', async () => {
    const valid = { email: 'valid.011@fpt.edu.vn', username: 'Người dùng hợp lệ', role: 1, studentCode: 'SE911' };
    const cases: Array<{ patch: Record<string, unknown>; field: string }> = [
      { patch: { email: 'khong-phai-email' }, field: 'email' },
      { patch: { role: 4 }, field: 'role' },
      { patch: { username: '   ' }, field: 'username' },
      { patch: { studentCode: 'X'.repeat(21) }, field: 'studentCode' }
    ];

    for (const { patch, field } of cases) {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', adminToken)
        .send({ ...valid, ...patch });
      expect(response.status, field).toBe(400);
      expect(response.body.errors, field).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })])
      );
    }
  });

  // ITC-US-012 - id user không tồn tại trên PATCH và lock → 404
  it('ITC-US-012 - user không tồn tại trên PATCH và lock trả 404', async () => {
    const missingId = randomUUID();

    const patch = await request(app)
      .patch(`/api/v1/users/${missingId}`)
      .set('Authorization', adminToken)
      .send({ username: 'Cập nhật không tồn tại' });
    expect(patch.status).toBe(404);
    expect(patch.body.message).toBe('Không tìm thấy người dùng.');

    const lock = await request(app).post(`/api/v1/users/${missingId}/lock`).set('Authorization', adminToken);
    expect(lock.status).toBe(404);
    expect(lock.body.message).toBe('Không tìm thấy người dùng.');
  });

  // ITC-US-013 - edit trùng email hoặc studentCode của user khác → 409
  it('ITC-US-013 - sửa trùng email hoặc studentCode của user khác trả 409', async () => {
    const target = await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      email: 'target.013@fpt.edu.vn',
      studentCode: 'SE013'
    });
    const other = await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      email: 'other.013@fpt.edu.vn',
      studentCode: 'SE014'
    });

    const emailConflict = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', adminToken)
      .send({ email: other.email });
    expect(emailConflict.status).toBe(409);
    expect(emailConflict.body.message).toBe('Email đã tồn tại.');

    const codeConflict = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', adminToken)
      .send({ studentCode: other.studentCode as string });
    expect(codeConflict.status).toBe(409);
    expect(codeConflict.body.message).toBe('Mã sinh viên đã tồn tại.');
  });

  // ITC-US-014 - dry-run import preview: mỗi dòng lỗi có message đúng (data.results)
  it('ITC-US-014 - dry-run import trả đúng message lỗi cho từng dòng ở data.results', async () => {
    const privileged = await TestDatabase.createUser({
      role: TestDatabase.roles.TEACHER,
      email: 'teacher.014@fpt.edu.vn'
    });
    const rows = [
      { rowNumber: 1, studentCode: 'SE921', username: 'Thiếu email', email: '' },
      { rowNumber: 2, studentCode: 'bad code!', username: 'Sai mã', email: 'badcode.014@fpt.edu.vn' },
      { rowNumber: 3, studentCode: 'SE923', username: 'Dòng gốc', email: 'dupe.014@fpt.edu.vn' },
      { rowNumber: 4, studentCode: 'SE924', username: 'Trùng email', email: 'dupe.014@fpt.edu.vn' },
      { rowNumber: 5, studentCode: 'SE925', username: 'Email giảng viên', email: privileged.email }
    ];

    const response = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({ rows, mode: 'skip', dryRun: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ dryRun: true, createdCount: 0, updatedCount: 0 });
    const results = response.body.data.results as Array<{ rowNumber: number; action: string; messages: string[] }>;
    expect(results).toHaveLength(rows.length);
    const byRow = new Map(results.map((result) => [result.rowNumber, result]));

    expect(byRow.get(1)?.action).toBe('ERROR');
    expect(byRow.get(1)?.messages).toContain('Thiếu email.');
    expect(byRow.get(2)?.action).toBe('ERROR');
    expect(byRow.get(2)?.messages).toContain('Mã sinh viên chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới, tối đa 20 ký tự.');
    expect(byRow.get(3)?.action).toBe('CREATE');
    expect(byRow.get(4)?.action).toBe('ERROR');
    expect(byRow.get(4)?.messages).toContain('Trùng email với dòng 3.');
    expect(byRow.get(5)?.action).toBe('ERROR');
    expect(byRow.get(5)?.messages).toContain('Email thuộc tài khoản giảng viên hoặc quản trị, không thể import.');

    expect(await TestDatabase.prisma.user.count({ where: { email: 'dupe.014@fpt.edu.vn' } })).toBe(0);
  });

  // ITC-US-015 - mode skip so với mode update cho user đã tồn tại
  it('ITC-US-015 - mode skip bỏ qua, mode update cập nhật user đã tồn tại', async () => {
    const seeded = await TestDatabase.createUser({
      role: TestDatabase.roles.STUDENT,
      email: 'existing.015@fpt.edu.vn',
      username: 'Tên cũ',
      studentCode: 'SE930'
    });
    const rows = [{ rowNumber: 1, studentCode: 'SE930', username: 'Tên mới', email: seeded.email }];
    const readUsername = async () =>
      (await TestDatabase.prisma.user.findUniqueOrThrow({ where: { id: seeded.id } })).username;

    // Luật code: nếu không có dòng nào CREATE/UPDATE thì ném 400 IMPORT_NO_ACTIONABLE_ROWS.
    // Vì vậy thêm 1 dòng mới để chế độ skip có việc phải làm.
    const skip = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({
        rows: [...rows, { rowNumber: 2, studentCode: 'SE931', username: 'SV mới', email: 'new.015@fpt.edu.vn' }],
        mode: 'skip',
        dryRun: false
      });
    expect(skip.status).toBe(200);
    expect(skip.body.message).toBe('Import hoàn tất.');
    expect(skip.body.data).toMatchObject({ dryRun: false, createdCount: 1, updatedCount: 0 });
    expect(skip.body.data.results[0]).toMatchObject({ action: 'SKIP', messages: ['Tài khoản đã tồn tại, bỏ qua.'] });
    expect(await readUsername()).toBe('Tên cũ');

    const update = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({
        rows: [...rows, { rowNumber: 3, studentCode: 'SE932', username: 'SV khác', email: 'other.015@fpt.edu.vn' }],
        mode: 'update',
        dryRun: false
      });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({ dryRun: false, createdCount: 1, updatedCount: 1 });
    expect(update.body.data.results[0]).toMatchObject({ action: 'UPDATE', messages: ['Cập nhật họ tên.'] });
    expect(await readUsername()).toBe('Tên mới');
  });

  // ITC-US-016 - import thật với toàn dòng lỗi → 400
  it('ITC-US-016 - import thật với toàn dòng lỗi trả 400', async () => {
    const rows = [
      { rowNumber: 1, studentCode: 'SE940', username: '', email: '' },
      { rowNumber: 2, studentCode: 'bad code!', username: 'Lỗi mã', email: 'bad.016@fpt.edu.vn' }
    ];

    const response = await request(app)
      .post('/api/v1/users/import')
      .set('Authorization', adminToken)
      .send({ rows, mode: 'skip', dryRun: false });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Không có dòng hợp lệ để import.');
    expect(await TestDatabase.prisma.user.count({ where: { studentCode: { in: rows.map((row) => row.studentCode) } } })).toBe(0);
  });

  // ITC-SC-004 - giá trị sai type / ngoài 0..100 / danh sách học kỳ sai
  it('ITC-SC-004 - config sai kiểu, ngoài 0..100 và học kỳ sai bị từ chối', async () => {
    const booleanConfig = await seedConfig({ key: 'test.boolean.flag', value: 'true', valueType: 'BOOLEAN', group: 'PRACTICE_RULE', label: 'Cờ boolean test' });
    const stringConfig = await seedConfig({ key: 'test.string.note', value: 'ghi chú', valueType: 'STRING', group: 'PRACTICE_RULE', label: 'Chuỗi test' });
    const minAccuracy = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'min_accuracy_default' } });
    const semesters = await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { key: 'class.semesters' } });
    const patchConfig = (id: string, value: string) =>
      request(app).patch(`/api/v1/system-configs/${id}`).set('Authorization', adminToken).send({ value });

    const wrongBoolean = await patchConfig(booleanConfig.id, 'maybe');
    expect(wrongBoolean.status).toBe(400);
    expect(wrongBoolean.body.message).toBe('Giá trị phải là true hoặc false.');

    const wrongString = await patchConfig(stringConfig.id, '');
    expect(wrongString.status).toBe(400);
    expect(wrongString.body.message).toBe('Giá trị không được để trống.');

    const outOfRange = await patchConfig(minAccuracy.id, '101');
    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.message).toBe('Giá trị phải nằm trong khoảng 0 đến 100.');
    expect((await TestDatabase.prisma.systemConfig.findUniqueOrThrow({ where: { id: minAccuracy.id } })).value).toBe('70');

    const badJson = await patchConfig(semesters.id, 'khong-phai-json');
    expect(badJson.status).toBe(400);
    expect(badJson.body.message).toBe('Giá trị phải là JSON hợp lệ.');

    const emptySemesters = await patchConfig(semesters.id, '[]');
    expect(emptySemesters.status).toBe(400);
    expect(emptySemesters.body.message).toContain('Danh sách học kỳ không được để trống');

    const badDate = await patchConfig(semesters.id, JSON.stringify([
      { name: 'FA26', startDate: '2026-09-07', endDate: 'khong-phai-ngay' }
    ]));
    expect(badDate.status).toBe(400);
    expect(badDate.body.message).toBe('Học kỳ thứ 1: ngày bắt đầu và ngày kết thúc phải có dạng yyyy-MM-dd.');
  });

  // ITC-SC-009 - luật số: nguyên, > 0, 0..100, phải là số; PATCH hợp lệ trả 200
  it('ITC-SC-009 - luật số của config đúng thông điệp và PATCH hợp lệ trả 200', async () => {
    const submissions = await seedConfig({ key: 'default_max_submissions', value: '3', valueType: 'NUMBER', group: 'PRACTICE_RULE', label: 'Số bài nộp tối đa' });
    const threshold = await seedConfig({ key: 'threshold_pass', value: '60', valueType: 'NUMBER', group: 'SCORING', label: 'Ngưỡng đạt' });
    const recording = await seedConfig({ key: 'max_recording_sec', value: '30', valueType: 'NUMBER', group: 'FILE_LIMIT', label: 'Thời lượng ghi âm tối đa' });
    const patchConfig = (id: string, value: string) =>
      request(app).patch(`/api/v1/system-configs/${id}`).set('Authorization', adminToken).send({ value });

    const fractional = await patchConfig(submissions.id, '2.5');
    expect(fractional.status).toBe(400);
    expect(fractional.body.message).toBe('Giá trị phải là số nguyên.');

    const zero = await patchConfig(submissions.id, '0');
    expect(zero.status).toBe(400);
    expect(zero.body.message).toBe('Giá trị phải lớn hơn 0.');

    const overPercent = await patchConfig(threshold.id, '101');
    expect(overPercent.status).toBe(400);
    expect(overPercent.body.message).toBe('Giá trị phải nằm trong khoảng 0 đến 100.');

    const notNumber = await patchConfig(recording.id, 'abc');
    expect(notNumber.status).toBe(400);
    expect(notNumber.body.message).toBe('Giá trị phải là một số.');

    const valid = await patchConfig(recording.id, '45');
    expect(valid.status).toBe(200);
    expect(valid.body.message).toBe('Cập nhật tham số thành công.');
    expect(valid.body.data.value).toBe('45');
  });
});
