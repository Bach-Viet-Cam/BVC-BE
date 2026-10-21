import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import NotificationPolicyService from './NotificationPolicyService.ts';

describe('NotificationPolicyService.resolveOutcome', () => {
  const now = new Date('2026-10-16T05:00:00Z');
  const future = new Date('2026-10-16T06:00:00Z');
  const past = new Date('2026-10-16T04:00:00Z');

  it('lưu nháp luôn là DRAFT và giữ nguyên scheduledAt, kể cả quá khứ', () => {
    assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'draft', scheduledAt: past, now }), { outcome: 'DRAFT', scheduledAt: past });
  });
  it('gửi không hẹn giờ → gửi ngay', () => {
    assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: null, now }), { outcome: 'SEND_NOW', scheduledAt: null });
  });
  it('gửi có hẹn giờ ở tương lai → SCHEDULED', () => {
    assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: future, now }), { outcome: 'SCHEDULED', scheduledAt: future });
  });
  it('hẹn giờ ở quá khứ → lỗi (Review Focus 1)', () => {
    const result = NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: past, now });
    assert.ok(result.error?.includes('tương lai'));
  });
  it('hẹn giờ đúng bằng hiện tại → lỗi', () => {
    assert.ok(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: now, now }).error);
  });
  it('ngày không hợp lệ → lỗi', () => {
    assert.ok(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: new Date('khong-hop-le'), now }).error);
  });
});

describe('NotificationPolicyService.canModify', () => {
  it('nháp và hẹn giờ còn sửa/xóa được', () => {
    assert.equal(NotificationPolicyService.canModify('DRAFT'), true);
    assert.equal(NotificationPolicyService.canModify('SCHEDULED'), true);
  });
  it('đã gửi thì bất biến', () => {
    assert.equal(NotificationPolicyService.canModify('SENT'), false);
  });
});

describe('NotificationPolicyService.recipientRoles', () => {
  it('ALL → null (mọi vai trò)', () => {
    assert.equal(NotificationPolicyService.recipientRoles('ALL'), null);
  });
  it('STUDENT → [1], TEACHER → [2]', () => {
    assert.deepEqual(NotificationPolicyService.recipientRoles('STUDENT'), [1]);
    assert.deepEqual(NotificationPolicyService.recipientRoles('TEACHER'), [2]);
  });
});
