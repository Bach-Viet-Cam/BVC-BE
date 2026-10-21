import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.ts';
import AuthService from '../../src/modules/auth/service/AuthService.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const csvHeader = 'Mã sinh viên,Họ tên,Email';

function csv(lines: string[]): Buffer {
  return Buffer.from([csvHeader, ...lines].join('\n'), 'utf8');
}

describe('Class members & import API (UC-10)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let lecturerToken: string;
  let classId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    lecturer = await TestDatabase.createLecturer();
    lecturerToken = TestDatabase.tokenFor(lecturer);
    const instrument = await TestDatabase.createInstrument('Đàn tranh');
    classId = (await TestDatabase.createClass(lecturer.id, instrument.id)).id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await TestDatabase.prisma.$disconnect();
  });

  function upload(buffer: Buffer, fileName: string = 'danh-sach.csv') {
    return request(app).post(`/api/v1/classes/${classId}/imports`).set('Authorization', lecturerToken).attach('file', buffer, fileName);
  }

  it('previews an import with per-row reasons and stores a Preview log', async () => {
    const member = await TestDatabase.createUser({ email: 'baolq@fpt.edu.vn', studentCode: 'SE170087' });
    await TestDatabase.addMember(classId, member.id, lecturer.id);

    const response = await upload(csv([
      'SE171234,Trần Minh Anh,anhtm@fpt.edu.vn',
      'SE172091,Phạm Gia Hân,hanpg@fpt.edu.vn',
      'SE171234,Trần Minh Anh,anhtm@fpt.edu.vn',
      'SE170087,Lê Quốc Bảo,baolq@fpt.edu.vn',
      'SE1,,x@fpt.edu.vn',
      ',,'
    ]));

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'PREVIEW', totalRows: 5, validRows: 2, errorRows: 3, fileName: 'danh-sach.csv' });
    expect(response.body.data.rows.map((row: { rowNumber: number; reason: string | null }) => [row.rowNumber, row.reason])).toEqual([
      [2, null],
      [3, null],
      [4, 'Trùng dòng 2 trong file'],
      [5, 'Đã có trong lớp'],
      [6, 'Thiếu họ tên']
    ]);
    const log = await TestDatabase.prisma.studentImportLog.findUniqueOrThrow({ where: { id: response.body.data.logId } });
    expect(log).toMatchObject({ status: 'PREVIEW', totalRows: 5, validRows: 2, errorRows: 3, fileType: 'csv' });
  });

  it('keeps UTF-8 Vietnamese file names', async () => {
    const response = await upload(csv(['SE1,A,a@fpt.edu.vn']), 'danh-sách-lớp.csv');
    expect(response.body.data.fileName).toBe('danh-sách-lớp.csv');
  });

  it('rejects bad files server-side: format MSG-13, size MSG-14, missing file, missing columns MSG-08', async () => {
    expect((await upload(Buffer.from('x'), 'ds.pdf')).body.code).toBe('MSG-13');
    const tooLarge = await upload(Buffer.alloc(2 * 1024 * 1024 + 10, 'a'), 'big.csv');
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body).toMatchObject({ code: 'MSG-14', message: 'File vượt quá dung lượng tối đa 2 MB.' });
    const noFile = await request(app).post(`/api/v1/classes/${classId}/imports`).set('Authorization', lecturerToken);
    expect(noFile.body.code).toBe('MSG-35');
    expect((await upload(Buffer.from('Email\na@fpt.edu.vn'))).body.code).toBe('MSG-08');
    expect(await TestDatabase.prisma.studentImportLog.count()).toBe(0);
  });

  it('confirms: creates Pending accounts, links existing students, sets the log Confirmed, answers MSG-45', async () => {
    const existing = await TestDatabase.createUser({ email: 'hanpg@fpt.edu.vn', studentCode: null, username: 'Hân' });
    const preview = await upload(csv([
      'SE171234,Trần Minh Anh,AnhTM@fpt.edu.vn',
      'SE172091,Phạm Gia Hân,hanpg@fpt.edu.vn',
      'SE9,Lỗi,not-an-email'
    ]));
    const logId = preview.body.data.logId;

    const confirm = await request(app).post(`/api/v1/classes/${classId}/imports/${logId}/confirm`).set('Authorization', lecturerToken);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data).toEqual({ importedCount: 2, skippedCount: 1 });
    expect(confirm.body.message).toBe('Đã nhập 2 sinh viên, bỏ qua 1 dòng không hợp lệ.');

    const created = await TestDatabase.prisma.user.findUniqueOrThrow({ where: { email: 'anhtm@fpt.edu.vn' } });
    expect(created).toMatchObject({ status: 'PENDING', role: 1, studentCode: 'SE171234', username: 'Trần Minh Anh' });
    const linked = await TestDatabase.prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(linked).toMatchObject({ studentCode: 'SE172091', username: 'Hân', status: 'ACTIVE' });

    const log = await TestDatabase.prisma.studentImportLog.findUniqueOrThrow({ where: { id: logId } });
    expect(log.status).toBe('CONFIRMED');
    expect(await TestDatabase.prisma.classMember.count({ where: { classId, importLogId: logId, source: 'IMPORT' } })).toBe(2);
    expect(await TestDatabase.prisma.auditLog.count({ where: { action: 'CLASS_IMPORT_CONFIRM' } })).toBe(1);

    const again = await request(app).post(`/api/v1/classes/${classId}/imports/${logId}/confirm`).set('Authorization', lecturerToken);
    expect(again.status).toBe(409);
  });

  it('re-validates at confirm time: a student added after the preview is skipped', async () => {
    const preview = await upload(csv(['SE1,A,a@fpt.edu.vn', 'SE2,B,b@fpt.edu.vn']));
    await request(app).post(`/api/v1/classes/${classId}/members`).set('Authorization', lecturerToken)
      .send({ studentCode: 'SE1', fullName: 'A', email: 'a@fpt.edu.vn' });

    const confirm = await request(app).post(`/api/v1/classes/${classId}/imports/${preview.body.data.logId}/confirm`).set('Authorization', lecturerToken);
    expect(confirm.body.data).toEqual({ importedCount: 1, skippedCount: 1 });
    const log = await TestDatabase.prisma.studentImportLog.findUniqueOrThrow({ where: { id: preview.body.data.logId } });
    expect((log.rows as Array<{ reason: string | null }>)[0].reason).toBe('Đã có trong lớp');
  });

  it('refuses to confirm when no valid row remains and keeps the log in Preview', async () => {
    const preview = await upload(csv(['SE1,A,bad-email']));
    expect(preview.body.data.validRows).toBe(0);
    const confirm = await request(app).post(`/api/v1/classes/${classId}/imports/${preview.body.data.logId}/confirm`).set('Authorization', lecturerToken);
    expect(confirm.status).toBe(409);
    expect(confirm.body.message).toBe('Không thể nhập danh sách vì không có dòng hợp lệ.');
    expect((await TestDatabase.prisma.studentImportLog.findUniqueOrThrow({ where: { id: preview.body.data.logId } })).status).toBe('PREVIEW');
  });

  it('rolls back the whole confirm when one write fails (transactional)', async () => {
    const preview = await upload(csv(['SE1,A,a@fpt.edu.vn', 'SE2,B,b@fpt.edu.vn']));
    // Simulate a concurrent sign-up that steals SE2 after the re-validation read.
    const prisma = TestDatabase.prisma;
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((callback: (client: unknown) => Promise<unknown>) =>
      originalTransaction(async (transaction) => {
        const proxied = new Proxy(transaction, {
          get(target, property) {
            if (property !== 'classMember') return Reflect.get(target, property);
            return { ...target.classMember, createMany: async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); } };
          }
        });
        return callback(proxied);
      })) as never);

    const confirm = await request(app).post(`/api/v1/classes/${classId}/imports/${preview.body.data.logId}/confirm`).set('Authorization', lecturerToken);
    spy.mockRestore();
    expect(confirm.status).toBe(409);
    expect(await prisma.user.count({ where: { email: { in: ['a@fpt.edu.vn', 'b@fpt.edu.vn'] } } })).toBe(0);
    expect((await prisma.studentImportLog.findUniqueOrThrow({ where: { id: preview.body.data.logId } })).status).toBe('PREVIEW');
  });

  it('cancels a preview log and refuses to confirm it afterwards', async () => {
    const preview = await upload(csv(['SE1,A,a@fpt.edu.vn']));
    const logId = preview.body.data.logId;
    const cancel = await request(app).post(`/api/v1/classes/${classId}/imports/${logId}/cancel`).set('Authorization', lecturerToken);
    expect(cancel.status).toBe(200);
    expect((await TestDatabase.prisma.studentImportLog.findUniqueOrThrow({ where: { id: logId } })).status).toBe('CANCELLED');
    expect((await request(app).post(`/api/v1/classes/${classId}/imports/${logId}/cancel`).set('Authorization', lecturerToken)).status).toBe(200);
    expect((await request(app).post(`/api/v1/classes/${classId}/imports/${logId}/confirm`).set('Authorization', lecturerToken)).status).toBe(409);
  });

  it('does not let another lecturer touch the import log', async () => {
    const preview = await upload(csv(['SE1,A,a@fpt.edu.vn']));
    const other = await TestDatabase.createLecturer();
    const response = await request(app).post(`/api/v1/classes/${classId}/imports/${preview.body.data.logId}/confirm`)
      .set('Authorization', TestDatabase.tokenFor(other));
    expect(response.status).toBe(404);
  });

  it('downloads the .xlsx template', async () => {
    const response = await request(app).get('/api/v1/classes/import-template').set('Authorization', lecturerToken)
      .buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('mau-danh-sach-sinh-vien.xlsx');
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('adds one student as Pending, rejects duplicates and conflicts with field errors', async () => {
    const added = await request(app).post(`/api/v1/classes/${classId}/members`).set('Authorization', lecturerToken)
      .send({ studentCode: 'se171234', fullName: 'Trần Minh Anh', email: 'AnhTM@fpt.edu.vn' });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ studentCode: 'SE171234', email: 'anhtm@fpt.edu.vn', accountStatus: 'PENDING', fullName: 'Trần Minh Anh' });
    expect(added.body.message).toBe('Thêm sinh viên thành công.');

    const again = await request(app).post(`/api/v1/classes/${classId}/members`).set('Authorization', lecturerToken)
      .send({ studentCode: 'SE171234', fullName: 'Trần Minh Anh', email: 'anhtm@fpt.edu.vn' });
    expect(again.status).toBe(409);
    expect(again.body.errors[0]).toMatchObject({ field: 'email', message: 'Đã có trong lớp.' });

    const codeConflict = await request(app).post(`/api/v1/classes/${classId}/members`).set('Authorization', lecturerToken)
      .send({ studentCode: 'SE171234', fullName: 'Người khác', email: 'other@fpt.edu.vn' });
    expect(codeConflict.status).toBe(409);
    expect(codeConflict.body.errors[0].field).toBe('studentCode');

    const badEmail = await request(app).post(`/api/v1/classes/${classId}/members`).set('Authorization', lecturerToken)
      .send({ studentCode: 'SE2', fullName: 'B', email: 'bad' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.errors[0]).toMatchObject({ field: 'email', message: 'Email không hợp lệ.' });
  });

  it('lists members with search, account filter and the shown/total counter', async () => {
    const active = await TestDatabase.createUser({ username: 'Trần Minh Anh', studentCode: 'SE171234' });
    const pending = await TestDatabase.createUser({ username: 'Ngô Thảo My', studentCode: 'SE173355', status: 'PENDING' });
    const removed = await TestDatabase.createUser({ username: 'Đã xóa', studentCode: 'SE000001' });
    await TestDatabase.addMember(classId, active.id, lecturer.id);
    await TestDatabase.addMember(classId, pending.id, lecturer.id);
    const removedMembership = await TestDatabase.addMember(classId, removed.id, lecturer.id);
    await TestDatabase.prisma.classMember.update({ where: { id: removedMembership.id }, data: { removedAt: new Date() } });

    const all = await request(app).get(`/api/v1/classes/${classId}/members`).set('Authorization', lecturerToken);
    expect(all.body.data).toMatchObject({ totalMembers: 2, pagination: { total: 2 } });

    const pendingOnly = await request(app).get(`/api/v1/classes/${classId}/members`).query({ accountStatus: 'PENDING' }).set('Authorization', lecturerToken);
    expect(pendingOnly.body.data.items.map((item: { fullName: string }) => item.fullName)).toEqual(['Ngô Thảo My']);
    expect(pendingOnly.body.data).toMatchObject({ totalMembers: 2, pagination: { total: 1 } });

    const byCode = await request(app).get(`/api/v1/classes/${classId}/members`).query({ q: 'se1712' }).set('Authorization', lecturerToken);
    expect(byCode.body.data.items).toHaveLength(1);

    const tooLong = await request(app).get(`/api/v1/classes/${classId}/members`).query({ q: 'x'.repeat(101) }).set('Authorization', lecturerToken);
    expect(tooLong.status).toBe(400);
  });

  it('soft-removes a member (GBR-39) and re-adding reactivates the membership', async () => {
    const student = await TestDatabase.createUser({ email: 'sv@fpt.edu.vn', studentCode: 'SE5', username: 'SV' });
    await TestDatabase.addMember(classId, student.id, lecturer.id);

    const removed = await request(app).delete(`/api/v1/classes/${classId}/members/${student.id}`).set('Authorization', lecturerToken);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Xóa sinh viên thành công.');
    const rows = await TestDatabase.prisma.classMember.findMany({ where: { classId, userId: student.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].removedAt).not.toBeNull();
    expect(rows[0].removedById).toBe(lecturer.id);
    expect(await TestDatabase.prisma.auditLog.count({ where: { action: 'CLASS_MEMBER_REMOVE' } })).toBe(1);

    expect((await request(app).delete(`/api/v1/classes/${classId}/members/${student.id}`).set('Authorization', lecturerToken)).status).toBe(404);

    const readded = await request(app).post(`/api/v1/classes/${classId}/members`).set('Authorization', lecturerToken)
      .send({ studentCode: 'SE5', fullName: 'SV', email: 'sv@fpt.edu.vn' });
    expect(readded.status).toBe(201);
    expect(await TestDatabase.prisma.classMember.count({ where: { classId, userId: student.id, removedAt: null } })).toBe(1);
    expect(await TestDatabase.prisma.classMember.count({ where: { classId, userId: student.id } })).toBe(2);
  });

  it('activates a Pending imported account on its first Google sign-in (GBR-38) and refuses Locked accounts', async () => {
    await TestDatabase.createUser({ email: 'pending@fpt.edu.vn', status: 'PENDING', studentCode: 'SE7' });
    await TestDatabase.createUser({ email: 'locked@fpt.edu.vn', status: 'LOCKED' });
    const verifySpy = vi.spyOn(AuthService, 'verifyGoogleCredential');

    verifySpy.mockResolvedValueOnce({ providerId: 'google-pending', email: 'pending@fpt.edu.vn', username: 'Google Name' });
    const login = await request(app).post('/api/v1/auth/google').send({ credential: 'fake' });
    expect(login.status).toBe(200);
    const activated = await TestDatabase.prisma.user.findUniqueOrThrow({ where: { email: 'pending@fpt.edu.vn' } });
    expect(activated.status).toBe('ACTIVE');

    verifySpy.mockResolvedValueOnce({ providerId: 'google-locked', email: 'locked@fpt.edu.vn', username: 'Locked' });
    const locked = await request(app).post('/api/v1/auth/google').send({ credential: 'fake' });
    expect(locked.status).toBe(403);
    verifySpy.mockRestore();
  });
});
