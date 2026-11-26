import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();
const base = '/api/v1/classes';
const FORBIDDEN = 'Bạn không có quyền thực hiện thao tác này.';
const VALIDATION = 'Kiểm tra lại dữ liệu gửi đi';
const ENDED_MESSAGE = 'Không thể thay đổi lớp vì lớp đã kết thúc.';
const PROCESSED_MESSAGE = 'Không thể xác nhận nhập vì phiên nhập này đã được xử lý.';
const H1_CLASS = 'DTR101.M1.H1';

type User = Awaited<ReturnType<typeof TestDatabase.createUser>>;
type ClassRow = Awaited<ReturnType<typeof TestDatabase.createClass>>;

const as = (user: User) => TestDatabase.tokenFor(user);
const get = (token: string, path: string) => request(app).get(path).set('Authorization', token);
const post = (token: string, path: string, body?: object) => request(app).post(path).set('Authorization', token).send(body);
const patch = (token: string, path: string, body: object) => request(app).patch(path).set('Authorization', token).send(body);
const del = (token: string, path: string) => request(app).delete(path).set('Authorization', token);
const upload = (token: string, path: string, buffer: Buffer, fileName: string) =>
  request(app).post(path).set('Authorization', token).attach('file', buffer, fileName);

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// The source system's class file: sheet "Students", columns Kì học, Mã môn, Mã lớp, Mã sinh viên, Họ tên, Email.
async function classFile(rows: string[][], options: { term?: string; subject?: string; className?: string; sheet?: string } = {}): Promise<Buffer> {
  const { term = 'FA26', subject = 'DTR101', className = H1_CLASS, sheet = 'Students' } = options;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheet);
  worksheet.addRow(['Kì học', 'Mã môn', 'Mã lớp', 'Mã sinh viên', 'Họ tên', 'Email']);
  for (const row of rows) worksheet.addRow([term, subject, className, ...row]);
  return toBuffer(workbook);
}

const fileName = (subject = 'DTR101', className = H1_CLASS) => `Students_${subject}_${className}.xlsx`;

const threeStudents = [
  ['HE190001', 'Nguyễn Văn An', 'an1@fpt.edu.vn'],
  ['HE190002', 'Trần Thị Bình', 'binh2@fpt.edu.vn'],
  ['HE190003', 'Lê Văn Cường', 'cuong3@fpt.edu.vn']
];

// The simple template layout (sheet "Danh sách SV": Mã sinh viên, Họ tên, Email).
describe('Classes & Members integration cases', () => {
  let gvA: User;
  let gvB: User;
  let gvC: User;
  let sv1: User;
  let sv2: User;
  let tokenA: string;
  let tokenB: string;
  let instrument: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;
  let c1: ClassRow;

  async function createInstrumentWithCode(name: string, code: string, isActive = true) {
    return TestDatabase.prisma.instrument.create({ data: { name, code, isActive } });
  }

  async function newClass(name: string, overrides: Parameters<typeof TestDatabase.createClass>[2] = {}, owner: User = gvA) {
    return TestDatabase.createClass(owner.id, instrument.id, { startDate: TestDatabase.futureDate(-10), ...overrides, name });
  }

  async function memberOf(classRecord: ClassRow, user: User) {
    return TestDatabase.addMember(classRecord.id, user.id, gvA.id);
  }

  beforeEach(async () => {
    await TestDatabase.reset();
    gvA = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, email: 'gva@fpt.edu.vn', username: 'GV A' });
    gvB = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, email: 'gvb@fpt.edu.vn', username: 'GV B' });
    gvC = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, email: 'gvc@fpt.edu.vn', username: 'GV C' });
    sv1 = await TestDatabase.createUser({ email: 'sv1@fpt.edu.vn', username: 'SV 1', studentCode: 'HE01' });
    sv2 = await TestDatabase.createUser({ email: 'sv2@fpt.edu.vn', username: 'SV 2', studentCode: 'HE02' });
    tokenA = as(gvA);
    tokenB = as(gvB);
    instrument = await createInstrumentWithCode('Đàn tranh', 'DTR101');
    c1 = await newClass('DTR101.M1');
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  // ---------------------------------------------------------------- Create, view, edit and end a class

  it('ITC-CL-001 - Tạo lớp thành công và trùng mã lớp trong cùng học kỳ bị từ chối 409', async () => {
    await TestDatabase.prisma.class.delete({ where: { id: c1.id } });
    await TestDatabase.resetSemesters([{ name: 'FA26', startDate: '2026-09-07', endDate: '2026-12-27' }]);
    const created = await post(tokenA, base, { name: 'DTR101.M1', cohort: 'FA26', instrumentId: instrument.id, description: null });
    expect(created.status).toBe(201);
    expect(created.body.message).toBe('Tạo lớp thành công.');
    expect(created.body.data.status).toBe('ACTIVE');
    expect(created.body.data.startDate).toBe('2026-09-07');

    const duplicate = await post(as(gvB), base, { name: 'dtr101.m1', cohort: 'FA26', instrumentId: instrument.id });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ success: false, code: 'MSG-05', field: 'name', message: 'Mã lớp đã tồn tại.' });
  });

  it('ITC-CL-002 - Kiểm tra dữ liệu tạo lớp: tên trống, môn không phải uuid, học kỳ lạ, môn đã ngừng', async () => {
    const stopped = await createInstrumentWithCode('Sáo (đã ngừng)', 'SAO101', false);

    const emptyName = await post(tokenA, base, { name: '', cohort: 'FA26', instrumentId: instrument.id });
    expect(emptyName.status).toBe(400);
    expect(emptyName.body).toMatchObject({ success: false, field: 'name', message: VALIDATION });
    expect(emptyName.body.code).toBeUndefined();
    expect(emptyName.body.errors[0]).toMatchObject({ field: 'name', message: 'Mã lớp không được để trống.' });

    const badInstrument = await post(tokenA, base, { name: 'A', cohort: 'FA26', instrumentId: 'dan-tranh' });
    expect(badInstrument.status).toBe(400);
    expect(badInstrument.body).toMatchObject({ success: false, field: 'instrumentId', message: VALIDATION });
    expect(badInstrument.body.code).toBeUndefined();
    expect(badInstrument.body.errors[0]).toMatchObject({ field: 'instrumentId', message: 'Môn học không được để trống.' });

    const unknownCohort = await post(tokenA, base, { name: 'A', cohort: 'XX99', instrumentId: instrument.id });
    expect(unknownCohort.status).toBe(400);
    expect(unknownCohort.body).toMatchObject({ success: false, field: 'cohort', message: 'Học kỳ đã chọn không tồn tại. Vui lòng chọn học kỳ khác.' });

    const inactive = await post(tokenA, base, { name: 'A', cohort: 'FA26', instrumentId: stopped.id });
    expect(inactive.status).toBe(400);
    expect(inactive.body).toMatchObject({ success: false, field: 'instrumentId', message: 'Môn học đã chọn không còn hoạt động. Vui lòng chọn môn học khác.' });
  });

  it('ITC-CL-003 - GV khác không thấy lớp (404), sinh viên bị chặn 403', async () => {
    await memberOf(c1, sv1);
    await memberOf(c1, sv2);

    const otherLecturer = await get(tokenB, `${base}/${c1.id}`);
    expect(otherLecturer.status).toBe(404);
    expect(otherLecturer.body).toMatchObject({ success: false, message: 'Không tìm thấy lớp học.' });

    const student = await get(as(sv1), `${base}/${c1.id}`);
    expect(student.status).toBe(403);
    expect(student.body).toMatchObject({ success: false, message: FORBIDDEN });
  });

  it('ITC-CL-004 - Không đổi được môn học / học kỳ khi lớp đã bắt đầu', async () => {
    const bau = await createInstrumentWithCode('Đàn bầu', 'DBA101');

    const changeInstrument = await patch(tokenA, `${base}/${c1.id}`, { instrumentId: bau.id });
    expect(changeInstrument.status).toBe(409);
    expect(changeInstrument.body).toMatchObject({ success: false, code: 'MSG-08', field: 'instrumentId', message: 'Không thể đổi môn học vì lớp đã bắt đầu.' });

    const changeCohort = await patch(tokenA, `${base}/${c1.id}`, { cohort: 'SP27' });
    expect(changeCohort.status).toBe(409);
    expect(changeCohort.body).toMatchObject({ success: false, code: 'MSG-08', field: 'cohort', message: 'Không thể đổi học kỳ vì lớp đã bắt đầu.' });

    const changeDescription = await patch(tokenA, `${base}/${c1.id}`, { description: 'Lớp sáng thứ 2' });
    expect(changeDescription.status).toBe(200);
    expect(changeDescription.body.message).toBe('Cập nhật lớp thành công.');
  });

  it('ITC-CL-005 - Kết thúc lớp thì lớp chỉ còn đọc', async () => {
    await memberOf(c1, sv1);
    await memberOf(c1, sv2);

    const ended = await post(tokenA, `${base}/${c1.id}/end`);
    expect(ended.status).toBe(200);
    expect(ended.body.message).toBe('Kết thúc lớp thành công.');
    expect(ended.body.data.status).toBe('ENDED');

    const update = await patch(tokenA, `${base}/${c1.id}`, { description: 'x' });
    expect(update.status).toBe(409);
    expect(update.body).toMatchObject({ success: false, code: 'MSG-08', message: ENDED_MESSAGE });

    const addMember = await post(tokenA, `${base}/${c1.id}/members`, { studentCode: 'HE19', fullName: 'A', email: 'a@fpt.edu.vn' });
    expect(addMember.status).toBe(409);
    expect(addMember.body).toMatchObject({ success: false, code: 'MSG-08', message: ENDED_MESSAGE });
  });

  it('ITC-CL-006 - Danh sách lớp lọc theo trạng thái / học kỳ / từ khóa', async () => {
    await newClass('DTR102.M1');
    await newClass('DTR103.M1', { status: 'ENDED', cohort: 'SP26' });

    const defaultList = await get(tokenA, base);
    expect(defaultList.status).toBe(200);
    expect(defaultList.body.data.items).toHaveLength(2);

    const paged = await get(tokenA, `${base}?status=ALL&limit=1&page=2`);
    expect(paged.status).toBe(200);
    expect(paged.body.data.items).toHaveLength(1);
    expect(paged.body.data.pagination.total).toBe(3);

    const semesters = await get(tokenA, `${base}/semesters`);
    expect(semesters.status).toBe(200);
    expect(semesters.body.data.items.map((item: Backend.Semester) => item.name)).toEqual(['SP26', 'FA26', 'SP27']);
    expect(semesters.body.data.defaultName).toBeTruthy();
  });

  // ---------------------------------------------------------------- Class members

  it('ITC-CL-007 - Thêm sinh viên chưa có tài khoản tạo tài khoản PENDING', async () => {
    const lookup = await get(tokenA, `${base}/${c1.id}/members/lookup?email=sv9@fpt.edu.vn`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.data).toMatchObject({ status: 'NEW', fullName: null, studentCode: null });

    const added = await post(tokenA, `${base}/${c1.id}/members`, { studentCode: 'HE190009', fullName: 'Lê Chi', email: 'sv9@fpt.edu.vn' });
    expect(added.status).toBe(201);
    expect(added.body.message).toBe('Thêm sinh viên thành công.');

    const account = await TestDatabase.prisma.user.findUniqueOrThrow({ where: { email: 'sv9@fpt.edu.vn' } });
    expect(account.status).toBe('PENDING');
  });

  it('ITC-CL-008 - Các lý do không thêm được sinh viên: đã trong lớp, mã của email khác, email không phải SV, email sai', async () => {
    await memberOf(c1, sv1);
    await memberOf(c1, sv2);
    const url = `${base}/${c1.id}/members`;

    const inClass = await post(tokenA, url, { studentCode: 'HE01', fullName: 'SV 1', email: 'sv1@fpt.edu.vn' });
    expect(inClass.status).toBe(409);
    expect(inClass.body).toMatchObject({ field: 'email', message: 'Đã có trong lớp.' });

    const codeOfOther = await post(tokenA, url, { studentCode: 'HE01', fullName: 'X', email: 'khac@fpt.edu.vn' });
    expect(codeOfOther.status).toBe(409);
    expect(codeOfOther.body).toMatchObject({ field: 'studentCode', message: 'Mã sinh viên đã thuộc tài khoản có email khác.' });

    const lecturerEmail = await post(tokenA, url, { studentCode: 'HE99', fullName: 'GV B', email: 'gvb@fpt.edu.vn' });
    expect(lecturerEmail.status).toBe(409);
    expect(lecturerEmail.body.message).toBe('Email thuộc tài khoản không phải sinh viên.');

    const badEmail = await post(tokenA, url, { studentCode: 'HE99', fullName: 'A', email: 'a@' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body).toMatchObject({ success: false, field: 'email', message: VALIDATION });
    expect(badEmail.body.code).toBeUndefined();
    expect(badEmail.body.errors[0]).toMatchObject({ field: 'email', message: 'Email không hợp lệ.' });
  });

  it('ITC-CL-009 - Xóa thành viên và xóa người không thuộc lớp', async () => {
    await memberOf(c1, sv1);
    await memberOf(c1, sv2);
    const pending = await TestDatabase.createUser({ email: 'pending@fpt.edu.vn', status: 'PENDING', studentCode: 'HE03', username: 'Chờ' });
    await memberOf(c1, pending);

    const removed = await del(tokenA, `${base}/${c1.id}/members/${sv2.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Xóa sinh viên thành công.');

    const again = await del(tokenA, `${base}/${c1.id}/members/${sv2.id}`);
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ success: false, message: 'Không tìm thấy sinh viên trong lớp.' });

    const list = await get(tokenA, `${base}/${c1.id}/members?accountStatus=PENDING`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].accountStatus).toBe('PENDING');
  });

  // ---------------------------------------------------------------- Import members

  it('ITC-CL-010 - Tải file mẫu và xem trước file .xlsx hợp lệ', async () => {
    const h1 = await newClass(H1_CLASS);
    const template = await get(tokenA, `${base}/import-template`).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(template.status).toBe(200);
    expect(template.headers['content-disposition']).toContain('mau-danh-sach-sinh-vien.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template.body as never);
    expect(workbook.getWorksheet('Danh sách SV')).toBeDefined();

    const file = await classFile([
      ['HE190001', 'Nguyễn Văn An', 'an1@fpt.edu.vn'],
      ['HE190002', 'Trần Thị Bình', 'binh2@fpt.edu.vn'],
      ['HE190003', 'Lê Văn Cường', 'sai-email']
    ]);
    const preview = await upload(tokenA, `${base}/${h1.id}/imports`, file, fileName());
    expect(preview.status).toBe(201);
    expect(preview.body.data.logId).toBeTruthy();
    expect(preview.body.data.rows.filter((row: { isValid: boolean }) => row.isValid)).toHaveLength(2);
    const invalid = preview.body.data.rows.filter((row: { isValid: boolean }) => !row.isValid);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('Email không hợp lệ');
  });

  it('ITC-CL-011 - Xác nhận chỉ thêm dòng hợp lệ và không xác nhận lại được', async () => {
    const h1 = await newClass(H1_CLASS);
    const file = await classFile([threeStudents[0], threeStudents[1], ['HE190003', 'Lê Văn Cường', 'sai-email']]);
    const preview = await upload(tokenA, `${base}/${h1.id}/imports`, file, fileName());
    expect(preview.status).toBe(201);
    const logId = preview.body.data.logId;

    const confirm = await post(tokenA, `${base}/${h1.id}/imports/${logId}/confirm`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.importedCount).toBe(2);
    expect(await TestDatabase.prisma.classMember.count({ where: { classId: h1.id, removedAt: null } })).toBe(2);

    const again = await post(tokenA, `${base}/${h1.id}/imports/${logId}/confirm`);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ success: false, code: 'MSG-08', message: PROCESSED_MESSAGE });

    const cancel = await post(tokenA, `${base}/${h1.id}/imports/${logId}/cancel`);
    expect(cancel.status).toBe(409);
    expect(cancel.body).toMatchObject({ success: false, code: 'MSG-08', message: PROCESSED_MESSAGE });
  });

  it('ITC-CL-012 - File sai loại, file không có dòng dữ liệu, phiên nhập của lớp khác', async () => {
    const h1 = await newClass(H1_CLASS);
    const c2 = await newClass('DTR101.M2.H1');
    const url = `${base}/${h1.id}/imports`;

    const pdf = await upload(tokenA, url, Buffer.from('x'), 'ds.pdf');
    expect(pdf.status).toBe(400);
    expect(pdf.body).toMatchObject({ success: false, code: 'MSG-13', message: 'Chỉ hỗ trợ file .xlsx.' });

    const empty = await upload(tokenA, url, await classFile([]), fileName());
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Không thể nhập danh sách vì file không có dòng dữ liệu nào.');

    const preview = await upload(tokenA, url, await classFile(threeStudents), fileName());
    expect(preview.status).toBe(201);
    const otherClass = await post(tokenA, `${base}/${c2.id}/imports/${preview.body.data.logId}/confirm`);
    expect(otherClass.status).toBe(404);
    expect(otherClass.body).toMatchObject({ success: false, message: 'Không tìm thấy phiên nhập danh sách.' });
  });

  // ---------------------------------------------------------------- Co-lecturers

  it('ITC-CL-013 - Tìm giảng viên theo email để thêm làm giảng viên cùng dạy', async () => {
    const lookup = await get(tokenA, `${base}/lecturers/lookup?email=gvb`);
    expect(lookup.status).toBe(200);
    const items = lookup.body.data as Array<{ id: string }>;
    expect(items.map((item) => item.id)).toContain(gvB.id);
    expect(items.map((item) => item.id)).not.toContain(gvA.id);
    expect(items.length).toBeLessThanOrEqual(10);

    const missing = await get(tokenA, `${base}/lecturers/lookup`);
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ field: 'email', message: VALIDATION });
  });

  it('ITC-CL-014 - GV chính thêm giảng viên cùng dạy, người đó mở được lớp', async () => {
    const locked = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, status: 'LOCKED' });
    const url = `${base}/${c1.id}/lecturers`;

    const added = await post(tokenA, url, { lecturerId: gvB.id });
    expect(added.status).toBe(201);
    expect(added.body.message).toBe('Thêm giảng viên thành công.');

    expect((await get(tokenB, `${base}/${c1.id}`)).status).toBe(200);

    const again = await post(tokenA, url, { lecturerId: gvB.id });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ success: false, message: 'Giảng viên đã có trong lớp.' });

    const owner = await post(tokenA, url, { lecturerId: gvA.id });
    expect(owner.status).toBe(400);
    expect(owner.body).toMatchObject({ field: 'coLecturerIds', message: 'Giảng viên chính không cần thêm làm giảng viên cùng dạy.' });

    const lockedLecturer = await post(tokenA, url, { lecturerId: locked.id });
    expect(lockedLecturer.status).toBe(400);
    expect(lockedLecturer.body).toMatchObject({ field: 'coLecturerIds', message: 'Giảng viên đã chọn không tồn tại hoặc đã bị khóa.' });
  });

  it('ITC-CL-015 - Chỉ GV chính quản lý giảng viên cùng dạy, và gỡ giảng viên', async () => {
    await TestDatabase.addCoLecturer(c1.id, gvB.id, gvA.id);

    const byCoLecturer = await post(tokenB, `${base}/${c1.id}/lecturers`, { lecturerId: gvC.id });
    expect(byCoLecturer.status).toBe(403);
    expect(byCoLecturer.body).toMatchObject({ success: false, message: 'Chỉ giảng viên chính được quản lý giảng viên cùng dạy.' });

    const removed = await del(tokenA, `${base}/${c1.id}/lecturers/${gvB.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Gỡ giảng viên thành công.');

    const again = await del(tokenA, `${base}/${c1.id}/lecturers/${gvB.id}`);
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ success: false, message: 'Không tìm thấy giảng viên trong lớp.' });

    const audit = await TestDatabase.prisma.auditLog.findFirst({ where: { entityId: c1.id }, orderBy: { createdAt: 'desc' } });
    expect(audit?.action).toBe('CLASS_LECTURER_REMOVE');
  });

  // ---------------------------------------------------------------- Copy a class

  it('ITC-CL-016 - GV sao chép bài tập của lớp cũ sang lớp mới', async () => {
    await TestDatabase.createAssignment(c1.id, gvA.id, { kind: 'SOLO', title: 'Bài độc tấu' });
    await TestDatabase.createAssignment(c1.id, gvA.id, { kind: 'ENSEMBLE', title: 'Bài hòa tấu' });

    const source = await get(tokenA, `${base}/${c1.id}/copy-source`);
    expect(source.status).toBe(200);
    expect(source.body.data.assignments).toHaveLength(2);
    expect(source.body.data.instrument.id).toBe(instrument.id);

    const foreign = await get(tokenB, `${base}/${c1.id}/copy-source`);
    expect(foreign.status).toBe(404);

    type CopyItem = { title: string; kind: string; description: string | null; sheetMusic: { id: string } | null; requiredBpm: number | null; maxSubmissions: number | null; status: string };
    const assignments = (source.body.data.assignments as CopyItem[]).map((item) => ({
      title: item.title,
      kind: item.kind,
      description: item.description,
      sheetMusicId: item.sheetMusic?.id ?? null,
      requiredBpm: item.requiredBpm,
      maxSubmissions: item.maxSubmissions,
      status: item.status
    }));
    const copied = await post(tokenA, base, { name: 'DTR101.M2', cohort: 'FA26', instrumentId: instrument.id, sourceClassId: c1.id, assignments });
    expect(copied.status).toBe(201);
    expect(copied.body.message).toBe('Đã tạo lớp và sao chép 2 bài tập.');

    const twoSolo = [0, 1].map((index) => ({ title: `Solo ${index}`, kind: 'SOLO', status: 'DRAFT' }));
    const rejected = await post(tokenA, base, { name: 'DTR101.M3', cohort: 'FA26', instrumentId: instrument.id, assignments: twoSolo });
    expect(rejected.status).toBe(400);
    expect(rejected.body.errors.map((error: { field: string; code: string }) => [error.field, error.code])).toEqual([
      ['assignments.0.kind', 'MSG-08'],
      ['assignments.1.kind', 'MSG-08']
    ]);
  });

  // ---------------------------------------------------------------- Create a class from a file

  it('ITC-CL-017 - Xem trước file lớp hiển thị thông tin lớp và các dòng sinh viên', async () => {
    await TestDatabase.resetSemesters([...TestDatabase.defaultSemesters(), { name: 'FA26_H1', startDate: '2026-09-07', endDate: '2026-12-27' }]);
    const response = await upload(tokenA, `${base}/file-imports/preview`, await classFile(threeStudents), fileName());
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      fileName: fileName(),
      classInfo: { name: H1_CLASS, subjectCode: 'DTR101', cohort: 'FA26_H1' },
      blockingErrors: [],
      totalRows: 3,
      validRows: 3,
      errorRows: 0
    });
    expect(response.body.data.classInfo.instrument).toBeTruthy();
    expect(response.body.data.classInfo.startDate).toBeTruthy();
    expect(response.body.data.classInfo.endDate).toBeTruthy();
    expect(response.body.data.rows).toHaveLength(3);
  });

  it('ITC-CL-018 - Xác nhận file tạo lớp và nhập sinh viên một lần duy nhất', async () => {
    await TestDatabase.resetSemesters([...TestDatabase.defaultSemesters(), { name: 'FA26_H1', startDate: '2026-09-07', endDate: '2026-12-27' }]);
    const file = await classFile(threeStudents);
    const first = await upload(tokenA, `${base}/file-imports`, file, fileName());
    expect(first.status).toBe(201);
    expect(first.body.message).toBe(`Đã tạo lớp ${H1_CLASS} và nhập 3 sinh viên.`);
    expect(first.body.data).toMatchObject({ importedCount: 3, skippedCount: 0 });
    expect(first.body.data.classId).toBeTruthy();

    const second = await upload(tokenA, `${base}/file-imports`, file, fileName());
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ success: false, code: 'MSG-08', message: `Lớp ${H1_CLASS} kì FA26_H1 đã tồn tại.` });
  });

  it('ITC-CL-019 - File lớp sai bị chặn với lý do rõ ràng', async () => {
    const csv = await upload(tokenA, `${base}/file-imports`, Buffer.from('x'), 'ds.csv');
    expect(csv.status).toBe(400);
    expect(csv.body).toMatchObject({ code: 'MSG-13', message: 'Chỉ hỗ trợ file .xlsx.' });

    const badName = await upload(tokenA, `${base}/file-imports`, await classFile(threeStudents), 'ds.xlsx');
    expect(badName.status).toBe(400);
    expect(badName.body).toMatchObject({ code: 'MSG-08', message: 'Tên file phải có dạng Students_[Mã môn]_[Mã lớp].xlsx.' });

    const unknownTerm = await upload(tokenA, `${base}/file-imports/preview`, await classFile(threeStudents, { term: 'SU30' }), fileName());
    expect(unknownTerm.status).toBe(200);
    expect(unknownTerm.body.data.blockingErrors).toContain('Kì học SU30_H1 chưa có trong hệ thống. Vui lòng liên hệ admin để thêm kì học.');
  });

  // ---------------------------------------------------------------- More class checks

  it('ITC-CL-020 - Kiểm tra dữ liệu khi thêm thành viên', async () => {
    const url = `${base}/${c1.id}/members`;
    const valid = { studentCode: 'HE190020', fullName: 'Sinh viên', email: 'sv20@fpt.edu.vn' };

    const noName = await post(tokenA, url, { ...valid, fullName: '' });
    expect(noName.status).toBe(400);
    expect(noName.body.errors[0].message).toBe('Họ tên không được để trống.');

    const longCode = await post(tokenA, url, { ...valid, studentCode: 'H'.repeat(51) });
    expect(longCode.status).toBe(400);
    expect(longCode.body.errors[0].message).toBe('Mã sinh viên không được vượt quá 50 ký tự.');

    const badEmail = await post(tokenA, url, { ...valid, email: 'abc' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.errors[0].message).toBe('Email không hợp lệ.');
  });

  it('ITC-CL-021 - Lớp đã kết thúc không được thay đổi', async () => {
    const c9 = await newClass('DTR109.M1', { status: 'ENDED' });
    const responses = [
      await post(tokenA, `${base}/${c9.id}/members`, { studentCode: 'HE190021', fullName: 'Sinh viên', email: 'sv21@fpt.edu.vn' }),
      await patch(tokenA, `${base}/${c9.id}`, { description: 'Mô tả mới' }),
      await post(tokenA, `${base}/${c9.id}/end`)
    ];
    for (const response of responses) {
      expect(response.status).toBe(409);
      expect(response.body.message).toBe(ENDED_MESSAGE);
    }
  });

  it('ITC-CL-022 - Các lỗi khi thêm / gỡ giảng viên cùng dạy', async () => {
    const locked = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER, status: 'LOCKED' });
    await TestDatabase.addCoLecturer(c1.id, gvB.id, gvA.id);
    const url = `${base}/${c1.id}/lecturers`;

    const owner = await post(tokenA, url, { lecturerId: gvA.id });
    expect(owner.status).toBe(400);
    expect(owner.body.message).toBe('Giảng viên chính không cần thêm làm giảng viên cùng dạy.');

    const lockedLecturer = await post(tokenA, url, { lecturerId: locked.id });
    expect(lockedLecturer.status).toBe(400);
    expect(lockedLecturer.body.message).toBe('Giảng viên đã chọn không tồn tại hoặc đã bị khóa.');

    const already = await post(tokenA, url, { lecturerId: gvB.id });
    expect(already.status).toBe(409);
    expect(already.body.message).toBe('Giảng viên đã có trong lớp.');

    const notInClass = await del(tokenA, `${url}/${gvC.id}`);
    expect(notInClass.status).toBe(404);
    expect(notInClass.body.message).toBe('Không tìm thấy giảng viên trong lớp.');

    const notUuid = await post(tokenA, url, { lecturerId: 'abc' });
    expect(notUuid.status).toBe(400);
    expect(notUuid.body.errors[0].message).toBe('Giảng viên cùng dạy không được để trống.');
  });

  it('ITC-CL-023 - Lớp không dùng được môn học đã ngừng', async () => {
    const stopped = await createInstrumentWithCode('Đàn cũ', 'OLD101', false);
    const response = await post(tokenA, base, { name: 'DTR101.M9', cohort: 'FA26', instrumentId: stopped.id });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ field: 'instrumentId', message: 'Môn học đã chọn không còn hoạt động. Vui lòng chọn môn học khác.' });
  });

  it('ITC-CL-024 - Giới hạn độ dài của lớp', async () => {
    const longName = await post(tokenA, base, { name: 'A'.repeat(101), cohort: 'FA26', instrumentId: instrument.id });
    expect(longName.status).toBe(400);
    expect(longName.body.errors[0].message).toBe('Mã lớp không được vượt quá 100 ký tự.');

    const longDescription = await post(tokenA, base, { name: 'DTR101.M9', cohort: 'FA26', instrumentId: instrument.id, description: 'M'.repeat(501) });
    expect(longDescription.status).toBe(400);
    expect(longDescription.body.errors[0].message).toBe('Mô tả không được vượt quá 500 ký tự.');
  });

  it('ITC-CL-025 - File danh sách thành viên sai', async () => {
    const h1 = await newClass(H1_CLASS);
    const url = `${base}/${h1.id}/imports`;

    const pdf = await upload(tokenA, url, Buffer.from('x'), 'list.pdf');
    expect(pdf.status).toBe(400);
    expect(pdf.body.message).toBe('Chỉ hỗ trợ file .xlsx.');

    const tooLarge = await upload(tokenA, url, Buffer.alloc(3 * 1024 * 1024, 'a'), fileName());
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.message).toBe('File vượt quá dung lượng tối đa 2 MB.');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['Kì học', 'Mã môn', 'Mã lớp', 'Mã sinh viên', 'Họ tên']);
    sheet.addRow(['FA26', 'DTR101', H1_CLASS, 'HE190001', 'Nguyễn Văn An']);
    const noEmail = await upload(tokenA, url, await toBuffer(workbook), fileName());
    expect(noEmail.status).toBe(201);
    expect(noEmail.body.data.rows).toHaveLength(1);
    expect(noEmail.body.data.rows[0]).toMatchObject({ isValid: false });
    expect(noEmail.body.data.rows[0].reason).toBeTruthy();

    const manyRows = Array.from({ length: 201 }, (_, index) => [`HE19${String(index).padStart(4, '0')}`, `SV ${index}`, `sv${index}@fpt.edu.vn`]);
    const tooMany = await upload(tokenA, url, await classFile(manyRows), fileName());
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toBe('Không thể nhập danh sách vì file có quá 200 dòng dữ liệu.');
  });

  it('ITC-CL-026 - File chỉ có sinh viên đã thuộc lớp', async () => {
    const h1 = await newClass(H1_CLASS);
    await memberOf(h1, sv1);
    await memberOf(h1, sv2);
    const file = await classFile([['HE01', 'SV 1', 'sv1@fpt.edu.vn'], ['HE02', 'SV 2', 'sv2@fpt.edu.vn']]);
    const response = await upload(tokenA, `${base}/${h1.id}/imports`, file, fileName());
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Tất cả sinh viên trong file đã có trong lớp.');
  });

  it('ITC-CL-027 - Hủy phiên nhập danh sách', async () => {
    const h1 = await newClass(H1_CLASS);
    const preview = await upload(tokenA, `${base}/${h1.id}/imports`, await classFile(threeStudents), fileName());
    expect(preview.status).toBe(201);
    const logId = preview.body.data.logId;

    const cancel = await post(tokenA, `${base}/${h1.id}/imports/${logId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.message).toBe('Đã hủy nhập danh sách.');

    const confirm = await post(tokenA, `${base}/${h1.id}/imports/${logId}/confirm`);
    expect(confirm.status).toBe(409);
    expect(confirm.body.message).toBe(PROCESSED_MESSAGE);

    const unknown = await post(tokenA, `${base}/${h1.id}/imports/${randomUUID()}/confirm`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe('Không tìm thấy phiên nhập danh sách.');
  });

  it('ITC-CL-028 - File tạo lớp sai: tên file, thiếu sheet Students, file .csv', async () => {
    const url = `${base}/file-imports/preview`;

    const badName = await upload(tokenA, url, await classFile(threeStudents), 'abc.xlsx');
    expect(badName.status).toBe(400);
    expect(badName.body.message).toBe('Tên file phải có dạng Students_[Mã môn]_[Mã lớp].xlsx.');

    const noSheet = await upload(tokenA, url, await classFile(threeStudents, { sheet: 'Sheet1' }), fileName());
    expect(noSheet.status).toBe(400);
    expect(noSheet.body.message).toBe('File không có sheet Students.');

    const csv = await upload(tokenA, url, Buffer.from('x'), 'Students_DTR101_DTR101.M1.H1.csv');
    expect(csv.status).toBe(400);
    expect(csv.body.message).toBe('Chỉ hỗ trợ file .xlsx.');
  });

  it('ITC-CL-029 - File tạo lớp của lớp đã tồn tại trong cùng học kỳ', async () => {
    await TestDatabase.resetSemesters([...TestDatabase.defaultSemesters(), { name: 'FA26_H1', startDate: '2026-09-07', endDate: '2026-12-27' }]);
    await newClass(H1_CLASS, { cohort: 'FA26_H1' });
    const message = `Lớp ${H1_CLASS} kì FA26_H1 đã tồn tại.`;

    const preview = await upload(tokenA, `${base}/file-imports/preview`, await classFile(threeStudents), fileName());
    expect(preview.status).toBe(200);
    expect(preview.body.data.blockingErrors).toContain(message);

    const confirm = await upload(tokenA, `${base}/file-imports`, await classFile(threeStudents), fileName());
    expect(confirm.status).toBe(409);
    expect(confirm.body.message).toBe(message);
  });

  it('ITC-CL-030 - File tạo lớp có mã môn chưa có trong hệ thống', async () => {
    await TestDatabase.resetSemesters([...TestDatabase.defaultSemesters(), { name: 'FA26_H1', startDate: '2026-09-07', endDate: '2026-12-27' }]);
    const className = 'XYZ999.M1.H1';
    const file = await classFile(threeStudents, { subject: 'XYZ999', className });
    const message = 'Mã môn XYZ999 chưa có trong hệ thống. Vui lòng liên hệ admin để thêm mã môn mới.';

    const preview = await upload(tokenA, `${base}/file-imports/preview`, file, fileName('XYZ999', className));
    expect(preview.status).toBe(200);
    expect(preview.body.data.blockingErrors).toContain(message);

    const confirm = await upload(tokenA, `${base}/file-imports`, file, fileName('XYZ999', className));
    expect(confirm.status).toBe(400);
    expect(confirm.body.message).toBe(message);
  });

  it('ITC-CL-031 - Đổi mã lớp trùng với lớp khác cùng học kỳ', async () => {
    const c2 = await newClass('DTR101.M2');

    const clash = await patch(tokenA, `${base}/${c1.id}`, { name: c2.name });
    expect(clash.status).toBe(409);
    expect(clash.body).toMatchObject({ field: 'name', message: 'Mã lớp đã tồn tại.' });

    const renamed = await patch(tokenA, `${base}/${c1.id}`, { name: 'DTR101.M7' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.message).toBe('Cập nhật lớp thành công.');
  });

  it('ITC-CL-032 - Thông báo khi thêm / xóa thành viên và giảng viên cùng dạy', async () => {
    const added = await post(tokenA, `${base}/${c1.id}/members`, { studentCode: 'HE190032', fullName: 'Sinh viên mới', email: 'sv32@fpt.edu.vn' });
    expect(added.status).toBe(201);
    expect(added.body.message).toBe('Thêm sinh viên thành công.');

    const student = await TestDatabase.prisma.user.findUniqueOrThrow({ where: { email: 'sv32@fpt.edu.vn' } });
    const removed = await del(tokenA, `${base}/${c1.id}/members/${student.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Xóa sinh viên thành công.');

    const lecturerAdded = await post(tokenA, `${base}/${c1.id}/lecturers`, { lecturerId: gvC.id });
    expect(lecturerAdded.status).toBe(201);
    expect(lecturerAdded.body.message).toBe('Thêm giảng viên thành công.');

    const lecturerRemoved = await del(tokenA, `${base}/${c1.id}/lecturers/${gvC.id}`);
    expect(lecturerRemoved.status).toBe(200);
    expect(lecturerRemoved.body.message).toBe('Gỡ giảng viên thành công.');
  });

  it('ITC-CL-033 - Danh sách học kỳ khi tạo lớp lấy từ tham số hệ thống', async () => {
    const first = await get(tokenA, `${base}/semesters`);
    expect(first.status).toBe(200);
    expect(first.body.data.items).toEqual(TestDatabase.defaultSemesters());

    const added = { name: 'SU27', startDate: DateTimeUtil.addDays(TestDatabase.futureDate(0), 300), endDate: DateTimeUtil.addDays(TestDatabase.futureDate(0), 380) };
    await TestDatabase.resetSemesters([...TestDatabase.defaultSemesters(), added]);
    const second = await get(tokenA, `${base}/semesters`);
    expect(second.status).toBe(200);
    expect(second.body.data.items.map((item: Backend.Semester) => item.name)).toContain('SU27');
  });

  it('ITC-CL-034 - Bộ lọc danh sách thành viên', async () => {
    await memberOf(c1, sv1);
    await memberOf(c1, sv2);
    const pending = await TestDatabase.createUser({ email: 'pending@fpt.edu.vn', status: 'PENDING', studentCode: 'HE777', username: 'Chờ' });
    await memberOf(c1, pending);
    const url = `${base}/${c1.id}/members`;

    const byStatus = await get(tokenA, `${url}?accountStatus=PENDING`);
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.items).toHaveLength(1);
    expect(byStatus.body.data.items[0].accountStatus).toBe('PENDING');

    const byCode = await get(tokenA, `${url}?q=HE77`);
    expect(byCode.status).toBe(200);
    expect(byCode.body.data.items).toHaveLength(1);
    expect(byCode.body.data.items[0].studentCode).toBe('HE777');

    const tooMany = await get(tokenA, `${url}?limit=201`);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.field).toBe('limit');
  });
});
