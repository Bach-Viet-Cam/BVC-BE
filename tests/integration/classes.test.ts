import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

describe('Classes API (UC-09)', () => {
  let lecturer: Awaited<ReturnType<typeof TestDatabase.createLecturer>>;
  let lecturerToken: string;
  let instrument: Awaited<ReturnType<typeof TestDatabase.createInstrument>>;

  beforeEach(async () => {
    await TestDatabase.reset();
    lecturer = await TestDatabase.createLecturer();
    lecturerToken = TestDatabase.tokenFor(lecturer);
    instrument = await TestDatabase.createInstrument('Đàn tranh');
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  it('lists semesters from system config with the default one', async () => {
    const response = await request(app).get('/api/v1/classes/semesters').set('Authorization', lecturerToken);
    expect(response.status).toBe(200);
    expect(response.body.data.items.map((semester: Backend.Semester) => semester.name)).toEqual(['SP26', 'FA26', 'SP27']);
    // Today is in no semester: FA26 ends closest to today.
    expect(response.body.data.defaultName).toBe('FA26');
  });

  it('creates a class spanning its semester, pinned to the lecturer, and audits it', async () => {
    const { startDate, endDate } = TestDatabase.defaultSemesters()[1];
    const response = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', lecturerToken)
      .send({ name: '  TRD301 — Nhạc cụ truyền thống ', cohort: 'fa26', instrumentId: instrument.id, description: 'Mô tả' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Tạo lớp thành công.');
    expect(response.body.data).toMatchObject({
      name: 'TRD301 — Nhạc cụ truyền thống',
      cohort: 'FA26',
      status: 'ACTIVE',
      startDate,
      endDate,
      memberCount: 0,
      hasStarted: false,
      isReadOnly: false,
      instrument: { id: instrument.id, name: 'Đàn tranh' }
    });
    expect(await TestDatabase.prisma.auditLog.count({ where: { action: 'CLASS_CREATE', actorId: lecturer.id } })).toBe(1);
  });

  it('returns field errors for blank, too long and unknown semester, and allows an ended semester', async () => {
    const blank = await request(app).post('/api/v1/classes').set('Authorization', lecturerToken)
      .send({ name: '  ', cohort: 'x'.repeat(51), instrumentId: instrument.id });
    expect(blank.status).toBe(400);
    expect(blank.body.errors).toEqual(expect.arrayContaining([
      { field: 'name', code: 'MSG-35', message: 'Mã lớp không được để trống.' },
      { field: 'cohort', code: 'MSG-37', message: 'Học kỳ không được vượt quá 50 ký tự.' }
    ]));

    const unknown = await request(app).post('/api/v1/classes').set('Authorization', lecturerToken)
      .send({ name: 'Lớp A', cohort: 'XX99', instrumentId: instrument.id });
    expect(unknown.status).toBe(400);
    expect(unknown.body.errors[0]).toMatchObject({ field: 'cohort', message: 'Học kỳ đã chọn không tồn tại. Vui lòng chọn học kỳ khác.' });

    const ended = await request(app).post('/api/v1/classes').set('Authorization', lecturerToken)
      .send({ name: 'Lớp A', cohort: 'SP26', instrumentId: instrument.id });
    expect(ended.status).toBe(201);
    expect(ended.body.data).toMatchObject({ startDate: TestDatabase.defaultSemesters()[0].startDate, hasStarted: true });
  });

  it('rejects an inactive instrument', async () => {
    const inactive = await TestDatabase.createInstrument('Đàn cũ', false);
    const response = await request(app).post('/api/v1/classes').set('Authorization', lecturerToken)
      .send({ name: 'Lớp A', cohort: 'FA26', instrumentId: inactive.id });
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe('instrumentId');
  });

  it('enforces a case-insensitive unique name per cohort but allows it in another cohort (DBR-02)', async () => {
    await TestDatabase.createClass(lecturer.id, instrument.id, { name: 'TRD301', cohort: 'FA26' });
    const duplicate = await request(app).post('/api/v1/classes').set('Authorization', lecturerToken)
      .send({ name: 'trd301', cohort: 'FA26', instrumentId: instrument.id });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ code: 'MSG-05', errors: [{ field: 'name', code: 'MSG-05', message: 'Mã lớp đã tồn tại.' }] });

    const otherCohort = await request(app).post('/api/v1/classes').set('Authorization', lecturerToken)
      .send({ name: 'TRD301', cohort: 'SP27', instrumentId: instrument.id });
    expect(otherCohort.status).toBe(201);
  });

  it('lists only own classes with filters, default status Hoạt động, counters and cohorts', async () => {
    const otherLecturer = await TestDatabase.createLecturer();
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    await TestDatabase.createClass(lecturer.id, instrument.id, { name: 'TRD301 — Sáng', cohort: 'FA26' });
    await TestDatabase.createClass(lecturer.id, bau.id, { name: 'TRD301 — Tối', cohort: 'FA26' });
    await TestDatabase.createClass(lecturer.id, instrument.id, { name: 'TRD201', cohort: 'SP26', status: 'ENDED' });
    await TestDatabase.createClass(otherLecturer.id, instrument.id, { name: 'Không phải của tôi' });

    const defaultList = await request(app).get('/api/v1/classes').set('Authorization', lecturerToken);
    expect(defaultList.status).toBe(200);
    expect(defaultList.body.data.items.map((item: { name: string }) => item.name).sort()).toEqual(['TRD301 — Sáng', 'TRD301 — Tối']);
    expect(defaultList.body.data).toMatchObject({ activeCount: 2, cohorts: ['SP26', 'FA26'], pagination: { page: 1, limit: 20, total: 2 } });

    const filtered = await request(app).get('/api/v1/classes')
      .query({ status: 'ALL', instrumentId: bau.id, q: 'tối' })
      .set('Authorization', lecturerToken);
    expect(filtered.body.data.items).toHaveLength(1);

    const finished = await request(app).get('/api/v1/classes').query({ status: 'ENDED', cohort: 'SP26' }).set('Authorization', lecturerToken);
    expect(finished.body.data.items.map((item: { name: string }) => item.name)).toEqual(['TRD201']);
  });

  it('hides another lecturer\'s class behind 404 and blocks students with 403', async () => {
    const otherLecturer = await TestDatabase.createLecturer();
    const foreignClass = await TestDatabase.createClass(otherLecturer.id, instrument.id);
    const notMine = await request(app).get(`/api/v1/classes/${foreignClass.id}`).set('Authorization', lecturerToken);
    expect(notMine.status).toBe(404);
    const editNotMine = await request(app).patch(`/api/v1/classes/${foreignClass.id}`).set('Authorization', lecturerToken).send({ name: 'Hack' });
    expect(editNotMine.status).toBe(404);

    const student = await TestDatabase.createUser();
    const asStudent = await request(app).get('/api/v1/classes').set('Authorization', TestDatabase.tokenFor(student));
    expect(asStudent.status).toBe(403);

    const anonymous = await request(app).get('/api/v1/classes');
    expect(anonymous.status).toBe(401);
  });

  it('updates a class that has not started and takes the dates of the new semester', async () => {
    const classRecord = await TestDatabase.createClass(lecturer.id, instrument.id, { name: 'Cũ' });
    const bau = await TestDatabase.createInstrument('Đàn bầu');
    const { startDate, endDate } = TestDatabase.defaultSemesters()[2];
    const response = await request(app).patch(`/api/v1/classes/${classRecord.id}`).set('Authorization', lecturerToken)
      .send({ name: 'Mới', instrumentId: bau.id, cohort: 'SP27', description: '' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ name: 'Mới', cohort: 'SP27', instrument: { id: bau.id }, startDate, endDate, description: null });
  });

  it('locks instrument and semester once the class has started (GBR-36) but allows other edits', async () => {
    const started = await TestDatabase.createClass(lecturer.id, instrument.id, { startDate: TestDatabase.futureDate(0) });
    const bau = await TestDatabase.createInstrument('Đàn bầu');

    const instrumentChange = await request(app).patch(`/api/v1/classes/${started.id}`).set('Authorization', lecturerToken).send({ instrumentId: bau.id });
    expect(instrumentChange.status).toBe(409);
    expect(instrumentChange.body.errors[0]).toMatchObject({ field: 'instrumentId', message: 'Không thể đổi môn học vì lớp đã bắt đầu.' });

    const semesterChange = await request(app).patch(`/api/v1/classes/${started.id}`).set('Authorization', lecturerToken).send({ cohort: 'SP27' });
    expect(semesterChange.status).toBe(409);
    expect(semesterChange.body.errors[0]).toMatchObject({ field: 'cohort', message: 'Không thể đổi học kỳ vì lớp đã bắt đầu.' });

    const sameValues = await request(app).patch(`/api/v1/classes/${started.id}`).set('Authorization', lecturerToken)
      .send({ instrumentId: instrument.id, description: 'Cập nhật mô tả' });
    expect(sameValues.status).toBe(200);
    expect(sameValues.body.data).toMatchObject({ hasStarted: true, description: 'Cập nhật mô tả' });
  });

  it('ends a class and then rejects every write on it (GBR-37)', async () => {
    const classRecord = await TestDatabase.createClass(lecturer.id, instrument.id);
    const student = await TestDatabase.createUser({ studentCode: 'SE1' });
    await TestDatabase.addMember(classRecord.id, student.id, lecturer.id);

    const ended = await request(app).post(`/api/v1/classes/${classRecord.id}/end`).set('Authorization', lecturerToken);
    expect(ended.status).toBe(200);
    expect(ended.body.data).toMatchObject({ status: 'ENDED', isReadOnly: true });
    expect(ended.body.message).toBe('Kết thúc lớp thành công.');

    const writes = await Promise.all([
      request(app).patch(`/api/v1/classes/${classRecord.id}`).set('Authorization', lecturerToken).send({ name: 'X' }),
      request(app).post(`/api/v1/classes/${classRecord.id}/end`).set('Authorization', lecturerToken),
      request(app).post(`/api/v1/classes/${classRecord.id}/members`).set('Authorization', lecturerToken)
        .send({ studentCode: 'SE9', fullName: 'A', email: 'a9@fpt.edu.vn' }),
      request(app).delete(`/api/v1/classes/${classRecord.id}/members/${student.id}`).set('Authorization', lecturerToken),
      request(app).post(`/api/v1/classes/${classRecord.id}/imports`).set('Authorization', lecturerToken)
        .attach('file', Buffer.from('Mã sinh viên,Họ tên,Email\nSE2,B,b@fpt.edu.vn\n'), 'ds.csv')
    ]);
    for (const write of writes) {
      expect(write.status).toBe(409);
      expect(write.body).toMatchObject({ code: 'MSG-08', message: 'Không thể thay đổi lớp vì lớp đã kết thúc.' });
    }

    const stillReadable = await request(app).get(`/api/v1/classes/${classRecord.id}/members`).set('Authorization', lecturerToken);
    expect(stillReadable.body.data.totalMembers).toBe(1);
  });

  it('lists active instruments for the class form', async () => {
    await TestDatabase.createInstrument('Đàn cũ', false);
    const response = await request(app).get('/api/v1/instruments').set('Authorization', lecturerToken);
    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { name: string }) => item.name)).toEqual(['Đàn tranh']);
  });
});
