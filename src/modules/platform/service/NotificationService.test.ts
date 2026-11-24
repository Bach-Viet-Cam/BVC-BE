import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import NotificationService from './NotificationService.ts';
import NotificationRepository from '../repository/NotificationRepository.ts';

const record = (overrides: Partial<Backend.NotificationRecord> = {}): Backend.NotificationRecord => ({
  id: 'n-1', title: 'Tieu de', body: 'Noi dung', type: 'SYSTEM', target: 'ALL',
  status: 'DRAFT', scheduledAt: null, sentAt: null, recipientCount: 0,
  createdAt: new Date('2026-11-01T00:00:00.000Z'), ...overrides
});

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'n-1', title: 'Tieu de', body: 'Noi dung', type: 'SYSTEM', target: 'ALL',
  status: 'DRAFT', scheduledAt: null, sentAt: null, recipientCount: 0,
  createdAt: '2026-11-01T00:00:00.000Z', ...overrides
});

const input = (overrides: Partial<Backend.NotificationInput> = {}): Backend.NotificationInput => ({
  title: 'Tieu de', body: 'Noi dung', type: 'SYSTEM', target: 'ALL',
  action: 'send', scheduledAt: null, ...overrides
});

test('UTC-NTS-001 - notifyUsers deduplicates user ids', async (t) => {
  const createMock = t.mock.method(NotificationRepository, 'createDelivered', async () => 3);
  const notification: Backend.UserNotification = { title: 'T', body: 'B', link: '/x' };

  const result = await NotificationService.notifyUsers(
    'actor-1', ['u1', 'u2', 'u2', 'u3'], notification, {} as never
  );

  assert.equal(result, 3);
  assert.deepEqual(createMock.mock.calls[0].arguments[1], ['u1', 'u2', 'u3']);
});

test('UTC-NTS-002 - list maps records through DTO', async (t) => {
  t.mock.method(NotificationRepository, 'list', async () => ({ items: [record()], total: 1 }));

  assert.deepEqual(await NotificationService.list({ page: 1, pageSize: 10 }), {
    items: [item()], total: 1, page: 1, pageSize: 10
  });
});

test('UTC-NTS-003 - getOrThrow returns found record', async (t) => {
  const row = record();
  t.mock.method(NotificationRepository, 'findById', async () => row);

  assert.strictEqual(await NotificationService.getOrThrow('n-1'), row);
});

test('UTC-NTS-004 - getOrThrow missing record returns 404', async (t) => {
  t.mock.method(NotificationRepository, 'findById', async () => null);

  // R1: ghi 400 ở lần 1
  await assert.rejects(
    () => NotificationService.getOrThrow('missing'),
    { statusCode: 404, message: 'Không tìm thấy thông báo.' }
  );
});

test('UTC-NTS-005 - draft plan keeps past scheduledAt', () => {
  const past = new Date('2026-11-01T00:00:00.000Z');
  const now = new Date('2026-11-02T00:00:00.000Z');

  const result = NotificationService.plan(
    input({ action: 'draft', scheduledAt: past.toISOString() }), now
  );

  assert.equal(result.outcome, 'DRAFT');
  assert.equal(result.scheduledAt?.toISOString(), past.toISOString());
});

test('UTC-NTS-006 - send plan with past schedule throws 400', () => {
  const past = new Date('2026-11-01T00:00:00.000Z');
  const now = new Date('2026-11-02T00:00:00.000Z');

  assert.throws(
    () => NotificationService.plan(
      input({ action: 'send', scheduledAt: past.toISOString() }), now
    ),
    { statusCode: 400, message: 'Thời điểm hẹn giờ phải ở tương lai.' }
  );
});

test('UTC-NTS-007 - toWriteData uses SCHEDULED status', () => {
  const future = new Date('2026-12-01T00:00:00.000Z');

  const data = NotificationService.toWriteData(
    input(), { outcome: 'SCHEDULED', scheduledAt: future }
  );

  assert.equal(data.status, 'SCHEDULED');
  assert.strictEqual(data.scheduledAt, future);
});

test('UTC-NTS-008 - toWriteData uses DRAFT status', () => {
  const past = new Date('2026-11-01T00:00:00.000Z');

  const data = NotificationService.toWriteData(
    input(), { outcome: 'DRAFT', scheduledAt: past }
  );

  // R1: ghi status SENT ở lần 1
  assert.equal(data.status, 'DRAFT');
});

test('UTC-NTS-009 - create with SEND_NOW calls send', async (t) => {
  t.mock.method(NotificationRepository, 'create', async () => record({ id: 'n-9' }));
  const sendMock = t.mock.method(NotificationService, 'send', async (id: string) => item({ id }));

  const result = await NotificationService.create('actor-1', input({ action: 'send', scheduledAt: null }));

  assert.equal(sendMock.mock.calls[0].arguments[0], 'n-9');
  assert.deepEqual(result, item({ id: 'n-9' }));
});

test('UTC-NTS-010 - update sent notification returns 409', async (t) => {
  t.mock.method(NotificationRepository, 'findById', async () => record({ id: 'n-10', status: 'SENT' }));

  // R1: nhầm 404
  await assert.rejects(
    () => NotificationService.update('n-10', input()),
    { statusCode: 409, message: 'Thông báo đã gửi, không thể sửa hoặc xóa.' }
  );
});

test('UTC-NTS-011 - send already delivered returns 409', async (t) => {
  t.mock.method(NotificationRepository, 'findById', async () => record());
  t.mock.method(NotificationRepository, 'deliverOnce', async () => null);

  await assert.rejects(
    () => NotificationService.send('n-1'),
    { statusCode: 409, message: 'Thông báo này đã được gửi.' }
  );
});

test('UTC-NTS-012 - deliverDue counts successful sends only', async (t) => {
  const now = new Date('2026-11-17T00:00:00.000Z');
  t.mock.method(NotificationRepository, 'listDueIds', async () => ['a', 'b', 'c']);
  t.mock.method(NotificationService, 'send', async (id: string) => {
    if (id === 'b') throw new AppError('bo qua', 404);
    return item({ id });
  });

  assert.equal(await NotificationService.deliverDue(now), 2);
});
