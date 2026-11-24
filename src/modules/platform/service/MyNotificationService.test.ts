import { test } from 'node:test';
import assert from 'node:assert/strict';
import MyNotificationService from './MyNotificationService.ts';
import UserNotificationRepository from '../repository/UserNotificationRepository.ts';

const notifRecord = (overrides: Record<string, unknown> = {}): Backend.MyNotificationRecord => ({
  id: 'n-1',
  isRead: false,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  notification: {
    title: 'Tieu de', body: 'Noi dung', type: 'SYSTEM', link: null,
    sentAt: new Date('2026-11-01T00:00:00.000Z')
  },
  ...overrides
}) as Backend.MyNotificationRecord;

const expectedItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'n-1', title: 'Tieu de', body: 'Noi dung', type: 'SYSTEM', link: null,
  isRead: false, sentAt: '2026-11-01T00:00:00.000Z', ...overrides
});

test('UTC-MNS-001 - list returns mapped items with total and unreadCount', async (t) => {
  const query: Backend.MyNotificationListQuery = { unreadOnly: false, page: 2, pageSize: 5 };
  t.mock.method(UserNotificationRepository, 'listForUser', async () => ({
    items: [notifRecord(), notifRecord({ id: 'n-2' })], total: 2
  }));
  t.mock.method(UserNotificationRepository, 'countUnread', async () => 3);

  const result = await MyNotificationService.list('user-1', query);

  assert.deepEqual(result, {
    items: [expectedItem(), expectedItem({ id: 'n-2' })],
    total: 2, page: 2, pageSize: 5, unreadCount: 3
  });
});

test('UTC-MNS-002 - countUnread wraps count in object', async (t) => {
  t.mock.method(UserNotificationRepository, 'countUnread', async () => 3);

  assert.deepEqual(await MyNotificationService.countUnread('user-1'), { count: 3 });
});

test('UTC-MNS-003 - markRead maps record to DTO item', async (t) => {
  t.mock.method(UserNotificationRepository, 'markRead', async () => notifRecord());

  assert.deepEqual(await MyNotificationService.markRead('user-1', 'n-1'), expectedItem());
});

test('UTC-MNS-004 - markRead missing record returns 404', async (t) => {
  t.mock.method(UserNotificationRepository, 'markRead', async () => null);

  await assert.rejects(
    () => MyNotificationService.markRead('user-1', 'missing'),
    { statusCode: 404, message: 'Không tìm thấy thông báo.' }
  );
});

test('UTC-MNS-005 - markAllRead returns updated count', async (t) => {
  t.mock.method(UserNotificationRepository, 'markAllRead', async () => 2);

  // R1: expected ghi {updated:true}
  assert.deepEqual(await MyNotificationService.markAllRead('user-1'), { updated: 2 });
});

test('UTC-MNS-006 - listForUser receives the original query', async (t) => {
  const query: Backend.MyNotificationListQuery = { unreadOnly: true, page: 1, pageSize: 20 };
  const listMock = t.mock.method(UserNotificationRepository, 'listForUser', async () => ({ items: [], total: 0 }));
  t.mock.method(UserNotificationRepository, 'countUnread', async () => 0);

  await MyNotificationService.list('user-1', query);

  assert.equal(listMock.mock.calls[0].arguments[1], query);
});

test('UTC-MNS-007 - markRead keeps isRead=true on DTO item', async (t) => {
  t.mock.method(UserNotificationRepository, 'markRead', async () => notifRecord({
    isRead: true,
    createdAt: new Date('2026-11-05T00:00:00.000Z'),
    notification: {
      title: 'Tieu de', body: 'Noi dung', type: 'SYSTEM', link: null, sentAt: null
    }
  }));

  const result = await MyNotificationService.markRead('user-1', 'n-1');
  assert.equal(result.isRead, true);
  assert.equal(result.sentAt, '2026-11-05T00:00:00.000Z');
});
