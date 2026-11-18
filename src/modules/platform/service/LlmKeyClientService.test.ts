import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import LlmKeyClientService from './LlmKeyClientService.ts';

const row = { id: 'k1', name: 'Key 1', provider: 'gemini', status: 'active', cooldownUntil: null, lastUsedAt: null, lastErrorCode: null, successCount: 0, failCount: 0, createdAt: '2026-01-01T00:00:00Z' };
const SECRET = 'sk-super-secret-value-123456';
const failing = (status: number, body: unknown): LlmKeyClientService => new LlmKeyClientService(async () => Response.json(body, { status }), 'secret', 'http://rhythm:8001');

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  try { await promise; } catch (error) { assert.ok(error instanceof AppError); return error; }
  throw new Error('Kỳ vọng bị từ chối.');
}

test('client gọi đúng đường dẫn, bearer key và trả về dữ liệu', async () => {
  const calls: Array<{ url: string; method?: string; body?: string; auth: string; redirect?: string }> = [];
  const request: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: options?.body as string | undefined, auth: (options?.headers as Record<string, string>).Authorization, redirect: options?.redirect });
    if (options?.method === 'DELETE') return new Response(null, { status: 204 });
    if (options?.method === 'GET') return Response.json({ items: [row] });
    return Response.json(row, { status: options?.method === 'POST' ? 201 : 200 });
  };
  const client = new LlmKeyClientService(request, 'secret', 'http://rhythm:8001');
  assert.deepEqual(await client.list(), [row]);
  assert.deepEqual(await client.create({ name: 'Key 1', key: SECRET, provider: 'gemini' }), row);
  assert.deepEqual(await client.update('k/1', { status: 'disabled' }), row);
  await client.remove('k1');
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ['GET', 'http://rhythm:8001/api/v1/admin/llm-keys'], ['POST', 'http://rhythm:8001/api/v1/admin/llm-keys'],
    ['PATCH', 'http://rhythm:8001/api/v1/admin/llm-keys/k%2F1'], ['DELETE', 'http://rhythm:8001/api/v1/admin/llm-keys/k1']
  ]);
  assert.ok(calls.every((call) => call.auth === 'Bearer secret' && call.redirect === 'error'));
  assert.deepEqual(JSON.parse(calls[1].body!), { name: 'Key 1', key: SECRET, provider: 'gemini' });
});

test('client thiếu apiKey trả 503 và không gọi upstream', async () => {
  let called = false;
  const client = new LlmKeyClientService(async () => { called = true; return Response.json({ items: [] }); }, '', 'http://rhythm:8001');
  assert.equal((await rejection(client.list())).statusCode, 503);
  assert.equal(called, false);
});

test('client ánh xạ 404, 409, 422, 5xx và lỗi mạng mà không lộ body upstream', async () => {
  const leak = `${SECRET} upstream-detail`;
  const detail = (code: string) => ({ detail: { code, message: leak } });
  const notFound = await rejection(failing(404, detail('LLM_KEY_NOT_FOUND')).remove('k1'));
  assert.equal(notFound.statusCode, 404);
  const duplicateName = await rejection(failing(409, detail('LLM_KEY_DUPLICATE_NAME')).create({ name: 'a', key: SECRET, provider: 'gemini' }));
  const duplicateValue = await rejection(failing(409, detail('LLM_KEY_DUPLICATE_VALUE')).create({ name: 'a', key: SECRET, provider: 'gemini' }));
  assert.equal(duplicateName.statusCode, 409); assert.equal(duplicateValue.statusCode, 409);
  assert.notEqual(duplicateName.message, duplicateValue.message);
  const validation = await rejection(failing(422, { detail: [{ msg: leak }] }).create({ name: 'a', key: SECRET, provider: 'gemini' }));
  assert.equal(validation.statusCode, 400);
  const encryption = await rejection(failing(503, detail('LLM_KEY_ENCRYPTION_UNAVAILABLE')).list());
  const server = await rejection(failing(500, { detail: leak }).list());
  const unauthorized = await rejection(failing(401, detail('X')).list());
  const network = await rejection(new LlmKeyClientService(async () => { throw new Error(leak); }, 'secret').list());
  const malformed = await rejection(new LlmKeyClientService(async () => Response.json({ nope: true }), 'secret').list());
  assert.equal(encryption.statusCode, 503);
  assert.equal(encryption.message, 'Dịch vụ chưa cấu hình khóa mã hóa API key.');
  for (const error of [server, unauthorized, network, malformed]) {
    assert.equal(error.statusCode, 503);
    assert.equal(error.message, 'Chưa thể kết nối dịch vụ quản lý API key.');
  }
  for (const error of [notFound, duplicateName, duplicateValue, validation, encryption, server, network]) {
    assert.ok(!error.message.includes(SECRET) && !error.message.includes('upstream-detail'));
  }
  const unknownConflict = await rejection(failing(409, detail('OTHER')).create({ name: 'a', key: SECRET, provider: 'gemini' }));
  assert.equal(unknownConflict.statusCode, 409);
});
