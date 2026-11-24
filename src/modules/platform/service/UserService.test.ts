import { test } from 'node:test';
import assert from 'node:assert/strict';
import UserService from './UserService.ts';
import UserRepository from '../repository/UserRepository.ts';

const user = (overrides: Partial<Backend.UserAdminRecord> = {}): Backend.UserAdminRecord => ({
  id: 'u-1', username: 'Nguyen', email: 'u1@example.com', role: 1,
  status: 'ACTIVE', studentCode: 'SV001', lastLoginAt: null, ...overrides
});

const listItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'u-1', username: 'Nguyen', email: 'u1@example.com', role: 1,
  status: 'ACTIVE', studentCode: 'SV001', lastLoginAt: null, ...overrides
});

test('UTC-USR-001 - list maps records through UserDTO', async (t) => {
  t.mock.method(UserRepository, 'list', async () => ({ items: [user()], total: 1 }));

  assert.deepEqual(await UserService.list({ page: 1, pageSize: 10 }), {
    items: [listItem()], total: 1, page: 1, pageSize: 10
  });
});

test('UTC-USR-002 - duplicate email returns 409', async (t) => {
  t.mock.method(UserRepository, 'findByEmail', async () => user({ id: 'other' }));

  await assert.rejects(
    () => UserService.assertUnique({ email: 'u1@example.com' }),
    { statusCode: 409, message: 'Email đã tồn tại.' }
  );
});

test('UTC-USR-003 - duplicate studentCode returns 409', async (t) => {
  t.mock.method(UserRepository, 'findByStudentCode', async () => user({ id: 'other' }));

  await assert.rejects(
    () => UserService.assertUnique({ studentCode: 'SV001' }),
    { statusCode: 409, message: 'Mã sinh viên đã tồn tại.' }
  );
});

test('UTC-USR-004 - ignoreUserId skips the matching user', async (t) => {
  t.mock.method(UserRepository, 'findByEmail', async () => user({ id: 'u-1' }));

  // R1: quên truyền ignoreUserId
  const result = await UserService.assertUnique({ email: 'u1@example.com' }, 'u-1');
  assert.equal(result, undefined);
});

test('UTC-USR-005 - create returns DTO of new record', async (t) => {
  t.mock.method(UserRepository, 'findByEmail', async () => null);
  t.mock.method(UserRepository, 'findByStudentCode', async () => null);
  t.mock.method(UserRepository, 'create', async () => user());

  assert.deepEqual(await UserService.create({ email: 'u1@example.com', username: 'Nguyen', role: 1 } as never), listItem());
});

test('UTC-USR-006 - getOrThrow missing user returns 404', async (t) => {
  t.mock.method(UserRepository, 'findById', async () => null);

  await assert.rejects(
    () => UserService.getOrThrow('missing'),
    { statusCode: 404, message: 'Không tìm thấy người dùng.' }
  );
});

test('UTC-USR-007 - email change after login returns 400', async (t) => {
  t.mock.method(UserRepository, 'findById', async () => user({ lastLoginAt: new Date('2026-11-01T00:00:00Z') }));

  await assert.rejects(
    () => UserService.update('actor-1', 'u-1', { email: 'new@example.com' }),
    { statusCode: 400, message: 'Không thể đổi email sau khi tài khoản đã đăng nhập.' }
  );
});

test('UTC-USR-008 - self role change returns 403', async (t) => {
  t.mock.method(UserRepository, 'findById', async () => user({ id: 'u-1', role: 2 }));
  t.mock.method(UserRepository, 'countActiveClassesOwnedBy', async () => 0);

  // R1: ghi message của canLock
  await assert.rejects(
    () => UserService.update('u-1', 'u-1', { role: 3 }),
    { statusCode: 403, message: 'Bạn không thể thay đổi vai trò của chính mình.' }
  );
});

test('UTC-USR-009 - self lock returns 403', async () => {
  await assert.rejects(
    () => UserService.lock('u-1', 'u-1'),
    { statusCode: 403, message: 'Bạn không thể tự khóa tài khoản của mình.' }
  );
});

test('UTC-USR-010 - unlock never-logged-in user sets PENDING', async (t) => {
  t.mock.method(UserRepository, 'findById', async () => user({ lastLoginAt: null }));
  const updateMock = t.mock.method(UserRepository, 'updateStatus', async () => user({ status: 'PENDING' }));

  const result = await UserService.unlock('u-1');

  assert.equal(updateMock.mock.calls[0].arguments[1], 'PENDING');
  assert.equal(result.status, 'PENDING');
});
