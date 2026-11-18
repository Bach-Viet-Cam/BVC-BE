import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import AuditLogger from '../../../lib/AuditLogger.ts';
import LlmKeyClientService from './LlmKeyClientService.ts';
import LlmKeyService from './LlmKeyService.ts';
import LlmKeyDTO from '../dto/LlmKeyDTO.ts';
import LlmKeyValidation from '../validation/LlmKeyValidation.ts';

const SECRET = 'sk-super-secret-value-123456';
const row = { id: 'k1', name: 'Key 1', provider: 'gemini' as const, status: 'active' as const, cooldownUntil: null, lastUsedAt: null, lastErrorCode: null, successCount: 0, failCount: 0, createdAt: '2026-01-01T00:00:00Z' };

afterEach(() => mock.restoreAll());

test('test_audit_payload_never_contains_key', async () => {
  const records: Backend.AuditEntry[] = [];
  mock.method(AuditLogger, 'record', async (entry: Backend.AuditEntry) => { records.push(entry); });
  mock.method(LlmKeyClientService.prototype, 'create', async () => row);
  mock.method(LlmKeyClientService.prototype, 'update', async () => row);
  mock.method(LlmKeyClientService.prototype, 'remove', async () => undefined);
  await LlmKeyService.create('admin', { name: 'Key 1', key: SECRET, provider: 'gemini' });
  await LlmKeyService.update('admin', 'k1', { name: 'Key 1', key: SECRET });
  await LlmKeyService.update('admin', 'k1', { status: 'disabled' });
  await LlmKeyService.remove('admin', 'k1');
  assert.deepEqual(records.map((entry) => entry.action), ['LLM_KEY_CREATE', 'LLM_KEY_UPDATE', 'LLM_KEY_UPDATE', 'LLM_KEY_DELETE']);
  assert.ok(records.every((entry) => entry.entityType === 'LLM_API_KEY' && entry.entityId === 'k1' && entry.actorId === 'admin'));
  assert.equal(records[1].payload?.keyReplaced, true);
  assert.ok(!JSON.stringify(records).includes(SECRET));
  assert.ok(records.every((entry) => !('key' in (entry.payload ?? {}))));
});

test('audit ghi trạng thái thực tế sau khi cập nhật, không ghi trạng thái được yêu cầu', async () => {
  const records: Backend.AuditEntry[] = [];
  mock.method(AuditLogger, 'record', async (entry: Backend.AuditEntry) => { records.push(entry); });
  mock.method(LlmKeyClientService.prototype, 'update', async () => ({ ...row, status: 'active' as const }));
  await LlmKeyService.update('admin', 'k1', { status: 'disabled', key: SECRET });
  assert.equal(records[0].payload?.status, 'active');
});

test('lỗi upstream không ghi audit', async () => {
  const record = mock.method(AuditLogger, 'record', async () => undefined);
  mock.method(LlmKeyClientService.prototype, 'create', async () => { throw new Error('fail'); });
  await assert.rejects(LlmKeyService.create('admin', { name: 'a', key: SECRET, provider: 'gemini' }));
  assert.equal(record.mock.callCount(), 0);
});

test('test_dto_strips_unknown_fields', () => {
  const dto = LlmKeyDTO.item({ ...row, keyHmac: 'abc', encryptedKey: 'zzz', key: SECRET } as never);
  assert.deepEqual(dto, row);
});

test('validation từ chối key rỗng/quá dài/quá ngắn và PATCH rỗng', () => {
  const create = (body: unknown) => LlmKeyValidation.create.safeParse({ body, params: {}, query: {} });
  assert.equal(create({ name: 'a', key: SECRET, provider: 'gemini' }).success, true);
  assert.equal(create({ name: 'a', key: '', provider: 'gemini' }).success, false);
  assert.equal(create({ name: 'a', key: 'short', provider: 'gemini' }).success, false);
  assert.equal(create({ name: 'a', key: 'x'.repeat(513), provider: 'gemini' }).success, false);
  assert.equal(create({ name: '', key: SECRET, provider: 'gemini' }).success, false);
  assert.equal(create({ name: 'a'.repeat(101), key: SECRET, provider: 'gemini' }).success, false);
  const parsed = create({ name: 'a', key: `  ${SECRET}  `, provider: 'gemini' });
  assert.equal(parsed.success && parsed.data.body.key, SECRET);
  const update = (body: unknown) => LlmKeyValidation.update.safeParse({ body, params: { id: 'k1' }, query: {} });
  assert.equal(update({}).success, false);
  assert.equal(update({ status: 'invalid' }).success, false);
  assert.equal(update({ status: 'disabled' }).success, true);
  assert.equal(update({ key: 'short' }).success, false);
});

test('validation lỗi không chứa giá trị key', () => {
  const result = LlmKeyValidation.create.safeParse({ body: { name: 'a', key: 'x'.repeat(600) + SECRET }, params: {}, query: {} });
  assert.equal(result.success, false);
  assert.ok(!JSON.stringify(result.error!.issues.map((issue) => issue.message)).includes(SECRET));
});

test('LlmKeyValidation yêu cầu chọn provider hợp lệ khi tạo key', () => {
  const create = (body: unknown) => LlmKeyValidation.create.safeParse({ body, params: {}, query: {} });
  assert.equal(create({ name: 'a', key: SECRET, provider: 'openrouter' }).success, true);
  assert.equal(create({ name: 'a', key: SECRET }).success, false);
  assert.equal(create({ name: 'a', key: SECRET, provider: 'other' }).success, false);
});
