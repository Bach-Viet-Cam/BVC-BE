import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import AuthService from '../../auth/service/AuthService.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import LlmKeyClientService from '../service/LlmKeyClientService.ts';
import { createApp } from '../../../app.ts';

const SECRET = 'sk-super-secret-value-123456';
const row = { id: '11111111-1111-4111-8111-111111111111', name: 'Key 1', status: 'active', cooldownUntil: null, lastUsedAt: null, lastErrorCode: null, successCount: 0, failCount: 0, createdAt: '2026-01-01T00:00:00Z', keyHmac: 'leak' };

afterEach(() => mock.restoreAll());

test('HTTP: chỉ SYSTEM_ADMIN dùng được và phản hồi không chứa key', async () => {
  mock.method(AuthService, 'verifyAccessToken', ((token: string) => ({ userId: token })) as never);
  mock.method(AuthService, 'getAuthenticatedUser', (async (userId: string) => ({ userId, username: userId, role: userId === 'admin' ? 3 : 2, email: 'a@example.com' })) as never);
  const audits: Backend.AuditEntry[] = [];
  mock.method(AuditLogger, 'record', async (entry: Backend.AuditEntry) => { audits.push(entry); });
  mock.method(LlmKeyClientService.prototype, 'list', async () => [row]);
  mock.method(LlmKeyClientService.prototype, 'create', async () => row);
  mock.method(LlmKeyClientService.prototype, 'update', async () => row);
  mock.method(LlmKeyClientService.prototype, 'remove', async () => undefined);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/admin/llm-keys`;
  const call = (token: string | null, path = '', method = 'GET', body?: unknown) => fetch(base + path, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  try {
    assert.equal((await call(null)).status, 401);
    assert.equal((await call('teacher')).status, 403);
    assert.equal((await call('teacher', '', 'POST', { name: 'a', key: SECRET })).status, 403);
    const list = await call('admin'); assert.equal(list.status, 200);
    const listText = await list.text();
    assert.ok(!listText.includes('keyHmac'));
    assert.equal((JSON.parse(listText) as { data: { items: unknown[] } }).data.items.length, 1);
    const created = await call('admin', '', 'POST', { name: 'Key 1', key: SECRET }); assert.equal(created.status, 201);
    assert.ok(!(await created.text()).includes(SECRET));
    const bad = await call('admin', '', 'POST', { name: 'Key 1', key: 'x' }); assert.equal(bad.status, 400);
    assert.ok(!(await bad.text()).includes('"x"'));
    assert.equal((await call('admin', `/${row.id}`, 'PATCH', {})).status, 400);
    assert.equal((await call('admin', `/${row.id}`, 'PATCH', { status: 'disabled' })).status, 200);
    assert.equal((await call('admin', `/${row.id}`, 'DELETE')).status, 200);
    assert.ok(!JSON.stringify(audits).includes(SECRET));
    assert.equal(audits.length, 3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
