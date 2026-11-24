import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.ts';
import AuditLogger from '../../src/lib/AuditLogger.ts';
import LlmKeyClientService from '../../src/modules/platform/service/LlmKeyClientService.ts';
import TestDatabase from './TestDatabase.ts';

const app = createApp();

const ratingPath = (submissionId: string) => `/api/v1/submissions/${submissionId}/ai-rating`;
const llmKeysPath = '/api/v1/admin/llm-keys';

const SECRET = 'sk-test-secret-value-1234567890';
const FEEDBACK = 'Giữ đều nhịp câu cuối.';
const STALE_MESSAGE = 'Phản hồi AI đã thay đổi hoặc chưa sẵn sàng. Vui lòng tải lại.';
const UNAVAILABLE_MESSAGE = 'Chưa thể kết nối dịch vụ quản lý API key.';
const KEY_ROW: Backend.LlmKeyItem = {
  id: 'k1',
  name: 'Key 1',
  provider: 'gemini',
  status: 'active',
  cooldownUntil: null,
  lastUsedAt: null,
  lastErrorCode: null,
  successCount: 0,
  failCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z'
};
const NEW_KEY = { name: KEY_ROW.name, key: SECRET, provider: 'gemini' as const };

type RatingState = { feedback: string | null; feedbackKey: string | null; canComment: boolean; rating: unknown };

async function makeFeedbackSubmission(status: 'COMPLETED' | 'PROCESSING' = 'COMPLETED', aiFeedback: string | null = FEEDBACK) {
  const student = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
  const lecturer = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
  const instrument = await TestDatabase.createInstrument();
  const classRecord = await TestDatabase.createClass(lecturer.id, instrument.id);
  await TestDatabase.addMember(classRecord.id, student.id, lecturer.id);
  const assignment = await TestDatabase.createAssignment(classRecord.id, lecturer.id);
  const submission = await TestDatabase.createSubmission(assignment.id, student.id, { status });
  await TestDatabase.prisma.submission.update({
    where: { id: submission.id },
    data: { aiFeedback, evaluationId: randomUUID(), analyzedAt: new Date() }
  });
  return { student, lecturer, classRecord, assignment, submission };
}

async function readRating(submissionId: string, token: string): Promise<RatingState> {
  const response = await request(app).get(ratingPath(submissionId)).set('Authorization', token);
  expect(response.status).toBe(200);
  return response.body.data as RatingState;
}

function saveRating(submissionId: string, token: string, body: object) {
  return request(app).put(ratingPath(submissionId)).set('Authorization', token).send(body);
}

// A real LlmKeyClientService wired to a fake fetch. Its private send() maps the simulated
// upstream response exactly like production, so the spy never calls itself recursively.
function upstreamClient(
  status: number,
  body: unknown = {},
  fetchImpl: typeof fetch = (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
) {
  return new LlmKeyClientService(fetchImpl, 'internal-key', 'http://rhythm.test');
}

const originalCreate = LlmKeyClientService.prototype.create;
const originalUpdate = LlmKeyClientService.prototype.update;
const originalRemove = LlmKeyClientService.prototype.remove;
const originalList = LlmKeyClientService.prototype.list;

describe('Template AR / LK integration cases', () => {
  let adminToken: string;
  let adminId: string;

  beforeEach(async () => {
    await TestDatabase.reset();
    const admin = await TestDatabase.createUser({ role: TestDatabase.roles.SYSTEM_ADMIN });
    adminId = admin.id;
    adminToken = TestDatabase.tokenFor(admin);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await TestDatabase.prisma.$disconnect();
  });

  // ---------------------------------------------------------------- AI Feedback Ratings

  it('ITC-AR-003 - Student gửi kèm comment bị từ chối 400', async () => {
    const { student, submission } = await makeFeedbackSubmission();
    const token = TestDatabase.tokenFor(student);
    const state = await readRating(submission.id, token);
    expect(state.feedback).toBe(FEEDBACK);
    expect(state.feedbackKey).toMatch(/^[a-f0-9]{64}$/);
    expect(state.canComment).toBe(false);

    const response = await saveRating(submission.id, token, {
      feedbackKey: state.feedbackKey, accuracyStars: 4, satisfactionStars: 5, comment: 'Quá hay!'
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Sinh viên chỉ được chấm sao, không gửi nhận xét.');
    expect(await TestDatabase.prisma.aiFeedbackRating.count({ where: { submissionId: submission.id } })).toBe(0);
  });

  it('ITC-AR-004 - GV chủ lớp và co-lecturer chấm kèm comment, comment được lưu', async () => {
    const { student, lecturer, classRecord, submission } = await makeFeedbackSubmission();
    const coLecturer = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    await TestDatabase.addCoLecturer(classRecord.id, coLecturer.id, lecturer.id);

    const raters = [
      { user: lecturer, comment: 'Nhận xét của giảng viên chủ nhiệm' },
      { user: coLecturer, comment: 'Nhận xét của giảng viên đồng dạy' }
    ];
    for (const { user, comment } of raters) {
      const token = TestDatabase.tokenFor(user);
      const state = await readRating(submission.id, token);
      expect(state.canComment).toBe(true);
      const response = await saveRating(submission.id, token, {
        feedbackKey: state.feedbackKey, accuracyStars: 5, satisfactionStars: 4, comment
      });
      expect(response.status).toBe(200);
      expect(response.body.data.rating).toMatchObject({ accuracyStars: 5, satisfactionStars: 4, comment });
    }

    const saved = await TestDatabase.prisma.aiFeedbackRating.findMany({ where: { submissionId: submission.id } });
    expect(saved).toHaveLength(2);
    expect(saved.map((row) => row.comment).sort()).toEqual(raters.map((rater) => rater.comment).sort());
    expect(saved.every((row) => row.raterRole === 2)).toBe(true);
  });

  it('ITC-AR-005 - feedbackKey sai hoặc feedback chưa sẵn sàng trả 409; GET luôn đủ 4 khoá', async () => {
    const { student, submission } = await makeFeedbackSubmission();
    const token = TestDatabase.tokenFor(student);
    const state = await readRating(submission.id, token);
    expect(Object.keys(state).sort()).toEqual(['canComment', 'feedback', 'feedbackKey', 'rating'].sort());

    const wrongKey = await saveRating(submission.id, token, {
      feedbackKey: '0'.repeat(64), accuracyStars: 4, satisfactionStars: 4
    });
    expect(wrongKey.status).toBe(409);
    expect(wrongKey.body.message).toBe(STALE_MESSAGE);

    const pending = await makeFeedbackSubmission('PROCESSING', null);
    const pendingToken = TestDatabase.tokenFor(pending.student);
    const pendingState = await readRating(pending.submission.id, pendingToken);
    expect(Object.keys(pendingState).sort()).toEqual(['canComment', 'feedback', 'feedbackKey', 'rating'].sort());
    expect(pendingState.feedback).toBeNull();
    expect(pendingState.feedbackKey).toBeNull();
    expect(pendingState.rating).toBeNull();

    const notReady = await saveRating(pending.submission.id, pendingToken, {
      feedbackKey: 'a'.repeat(64), accuracyStars: 4, satisfactionStars: 4
    });
    expect(notReady.status).toBe(409);
    expect(notReady.body.message).toBe(STALE_MESSAGE);
  });

  it('ITC-AR-006 - chỉ student chủ bài và GV lớp được mở rating', async () => {
    const { student, lecturer, classRecord, submission } = await makeFeedbackSubmission();
    const coLecturer = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    await TestDatabase.addCoLecturer(classRecord.id, coLecturer.id, lecturer.id);
    const strangerStudent = await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT });
    const strangerTeacher = await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER });
    const path = ratingPath(submission.id);

    for (const user of [student, lecturer, coLecturer]) {
      expect((await request(app).get(path).set('Authorization', TestDatabase.tokenFor(user))).status).toBe(200);
    }
    for (const user of [strangerStudent, strangerTeacher]) {
      const hidden = await request(app).get(path).set('Authorization', TestDatabase.tokenFor(user));
      expect(hidden.status).toBe(404);
      expect(hidden.body.message).toBe('Không tìm thấy bài nộp.');
    }
    expect((await request(app).get(path).set('Authorization', adminToken)).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
  });

  it('ITC-AR-007 - validate sao, feedbackKey và field lạ trả 400', async () => {
    const { student, submission } = await makeFeedbackSubmission();
    const token = TestDatabase.tokenFor(student);
    const state = await readRating(submission.id, token);
    const valid = { feedbackKey: state.feedbackKey, accuracyStars: 4, satisfactionStars: 4 };

    for (const [field, value] of [['accuracyStars', 0], ['accuracyStars', 6], ['satisfactionStars', 0], ['satisfactionStars', 6], ['accuracyStars', 1.5]] as const) {
      const response = await saveRating(submission.id, token, { ...valid, [field]: value });
      expect(response.status).toBe(400);
      expect(response.body.errors[0]).toMatchObject({ field });
    }

    const badKey = await saveRating(submission.id, token, { ...valid, feedbackKey: 'not-a-key' });
    expect(badKey.status).toBe(400);
    expect(badKey.body.errors[0]).toMatchObject({ field: 'feedbackKey' });

    const extraField = await saveRating(submission.id, token, { ...valid, unexpectedField: 'x' });
    expect(extraField.status).toBe(400);
    expect(extraField.body).not.toHaveProperty('field');
    expect(extraField.body.errors[0].message).toContain('unexpectedField');
  });

  // ---------------------------------------------------------------- LLM API Keys

  it('ITC-LK-001 - Admin list không lộ giá trị key', async () => {
    vi.spyOn(LlmKeyClientService.prototype, 'list').mockResolvedValue([
      { ...KEY_ROW, key: SECRET, keyHmac: 'hmac', encryptedKey: 'encrypted' } as unknown as Backend.LlmKeyItem
    ]);

    const response = await request(app).get(llmKeysPath).set('Authorization', adminToken);
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toEqual(KEY_ROW);
    for (const leaked of ['key', 'keyHmac', 'encryptedKey']) {
      expect(response.body.data.items[0]).not.toHaveProperty(leaked);
    }
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
  });

  it('ITC-LK-002 - create ghi audit LLM_KEY_CREATE, payload không chứa key value', async () => {
    const record = vi.spyOn(AuditLogger, 'record').mockResolvedValue(undefined);
    vi.spyOn(LlmKeyClientService.prototype, 'create').mockResolvedValue(KEY_ROW);

    const response = await request(app).post(llmKeysPath).set('Authorization', adminToken).send(NEW_KEY);
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(KEY_ROW);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);

    expect(record).toHaveBeenCalledTimes(1);
    const entry = record.mock.calls[0][0];
    expect(entry).toMatchObject({
      actorId: adminId,
      action: 'LLM_KEY_CREATE',
      entityType: 'LLM_API_KEY',
      entityId: KEY_ROW.id,
      payload: { name: KEY_ROW.name, provider: 'gemini' }
    });
    expect(JSON.stringify(entry)).not.toContain(SECRET);
  });

  it('ITC-LK-003 - validate name/key/provider trả 400 đúng message', async () => {
    const create = (body: object) => request(app).post(llmKeysPath).set('Authorization', adminToken).send(body);

    const blankName = await create({ ...NEW_KEY, name: '' });
    expect(blankName.status).toBe(400);
    expect(blankName.body.errors[0]).toMatchObject({ field: 'name', message: 'Vui lòng nhập tên API key.' });

    const shortKey = await create({ ...NEW_KEY, key: 'short' });
    expect(shortKey.status).toBe(400);
    expect(shortKey.body.errors[0]).toMatchObject({ field: 'key', message: 'API key không hợp lệ.' });

    const badProvider = await create({ ...NEW_KEY, provider: 'other' });
    expect(badProvider.status).toBe(400);
    expect(badProvider.body.errors[0]).toMatchObject({ field: 'provider', message: 'Vui lòng chọn nhà cung cấp AI.' });
  });

  it('ITC-LK-004 - upstream 409 duplicate map sang 409 kèm field name/key', async () => {
    const createSpy = vi.spyOn(LlmKeyClientService.prototype, 'create');

    createSpy.mockImplementation((input) => originalCreate.call(
      upstreamClient(409, { detail: { code: 'LLM_KEY_DUPLICATE_NAME' } }), input
    ));
    const duplicateName = await request(app).post(llmKeysPath).set('Authorization', adminToken).send(NEW_KEY);
    expect(duplicateName.status).toBe(409);
    expect(duplicateName.body.message).toBe('Tên API key đã tồn tại.');
    expect(duplicateName.body.field).toBe('name');

    createSpy.mockImplementation((input) => originalCreate.call(
      upstreamClient(409, { detail: { code: 'LLM_KEY_DUPLICATE_VALUE' } }), input
    ));
    const duplicateValue = await request(app).post(llmKeysPath).set('Authorization', adminToken).send(NEW_KEY);
    expect(duplicateValue.status).toBe(409);
    expect(duplicateValue.body.message).toBe('API key này đã được thêm trước đó.');
    expect(duplicateValue.body.field).toBe('key');
  });

  it('ITC-LK-005 - PATCH đổi status/key; body rỗng trả 400', async () => {
    const update = vi.spyOn(LlmKeyClientService.prototype, 'update').mockResolvedValue({ ...KEY_ROW, status: 'disabled' });
    const patch = (body: object) => request(app).patch(`${llmKeysPath}/${KEY_ROW.id}`).set('Authorization', adminToken).send(body);

    const empty = await patch({});
    expect(empty.status).toBe(400);
    expect(empty.body.errors[0].message).toBe('Vui lòng nhập ít nhất một trường cần cập nhật.');
    expect(update).not.toHaveBeenCalled();

    const disabled = await patch({ status: 'disabled' });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data).toMatchObject({ id: KEY_ROW.id, status: 'disabled' });
    expect(update).toHaveBeenCalledWith(KEY_ROW.id, { status: 'disabled' });

    update.mockResolvedValueOnce(KEY_ROW);
    const replaced = await patch({ key: SECRET });
    expect(replaced.status).toBe(200);
    expect(update).toHaveBeenCalledWith(KEY_ROW.id, { key: SECRET });
    expect(JSON.stringify(replaced.body)).not.toContain(SECRET);
  });

  it('ITC-LK-006 - DELETE trả data:null; upstream 404 trả 404', async () => {
    const remove = vi.spyOn(LlmKeyClientService.prototype, 'remove').mockResolvedValue(undefined);
    const del = () => request(app).delete(`${llmKeysPath}/${KEY_ROW.id}`).set('Authorization', adminToken);

    const success = await del();
    expect(success.status).toBe(200);
    expect(success.body.data).toBeNull();
    expect(success.body.message).toBe('Đã xóa API key.');
    expect(remove).toHaveBeenCalledWith(KEY_ROW.id);

    remove.mockImplementationOnce((id) => originalRemove.call(upstreamClient(404), id));
    const missing = await del();
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Không tìm thấy API key.');
  });

  it('ITC-LK-007 - internal key rỗng hoặc fetch lỗi trả 503', async () => {
    const noKeyClient = new LlmKeyClientService(
      (async () => new Response('{}', { status: 200 })) as typeof fetch, '', 'http://rhythm.test'
    );
    await expect(noKeyClient.list()).rejects.toMatchObject({ statusCode: 503, message: UNAVAILABLE_MESSAGE });

    const offlineClient = upstreamClient(200, {}, (async () => { throw new Error('network down'); }) as typeof fetch);
    await expect(offlineClient.list()).rejects.toMatchObject({ statusCode: 503, message: UNAVAILABLE_MESSAGE });

    vi.spyOn(LlmKeyClientService.prototype, 'list').mockImplementation(() => originalList.call(offlineClient));
    const response = await request(app).get(llmKeysPath).set('Authorization', adminToken);
    expect(response.status).toBe(503);
    expect(response.body.message).toBe(UNAVAILABLE_MESSAGE);
  });

  it('ITC-LK-008 - chỉ Admin truy cập được route llm-keys', async () => {
    const list = vi.spyOn(LlmKeyClientService.prototype, 'list').mockResolvedValue([]);
    const teacherToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.TEACHER }));
    const studentToken = TestDatabase.tokenFor(await TestDatabase.createUser({ role: TestDatabase.roles.STUDENT }));

    expect((await request(app).get(llmKeysPath).set('Authorization', adminToken)).status).toBe(200);
    expect(list).toHaveBeenCalledTimes(1);

    expect((await request(app).get(llmKeysPath)).status).toBe(401);
    expect((await request(app).get(llmKeysPath).set('Authorization', teacherToken)).status).toBe(403);
    expect((await request(app).get(llmKeysPath).set('Authorization', studentToken)).status).toBe(403);
    expect((await request(app).post(llmKeysPath).set('Authorization', teacherToken).send(NEW_KEY)).status).toBe(403);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
