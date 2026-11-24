import assert from 'node:assert/strict';
import { test } from 'node:test';
import NotificationPolicyService from './NotificationPolicyService.ts';

const NOW = new Date('2026-11-17T00:00:00.000Z');
const PAST = new Date('2026-11-16T10:00:00.000Z');
const FUTURE = new Date('2026-11-17T06:00:00.000Z');
const PAST_ERROR = 'Thời điểm hẹn giờ phải ở tương lai.';

test('UTC-NPP-001 - send without schedule sends now', () => {
  assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: null, now: NOW }), {
    outcome: 'SEND_NOW',
    scheduledAt: null
  });
});

test('UTC-NPP-002 - send with past schedule becomes draft', () => {
  // R1: sai giờ UTC+7
  assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: PAST, now: NOW }), {
    outcome: 'DRAFT',
    scheduledAt: null,
    error: PAST_ERROR
  });
});

test('UTC-NPP-003 - draft keeps past schedule', () => {
  assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'draft', scheduledAt: PAST, now: NOW }), {
    outcome: 'DRAFT',
    scheduledAt: PAST
  });
});

test('UTC-NPP-004 - send with future schedule is scheduled', () => {
  assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: FUTURE, now: NOW }), {
    outcome: 'SCHEDULED',
    scheduledAt: FUTURE
  });
});

test('UTC-NPP-005 - schedule equal to now is rejected', () => {
  assert.deepEqual(NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: NOW, now: NOW }), {
    outcome: 'DRAFT',
    scheduledAt: null,
    error: PAST_ERROR
  });
});

test('UTC-NPP-006 - invalid date is rejected', () => {
  // R1: expected để trống error
  assert.deepEqual(
    NotificationPolicyService.resolveOutcome({ action: 'send', scheduledAt: new Date('khong-hop-le'), now: NOW }),
    {
      outcome: 'DRAFT',
      scheduledAt: null,
      error: PAST_ERROR
    }
  );
});

test('UTC-NPP-007 - draft notification is modifiable', () => {
  assert.equal(NotificationPolicyService.canModify('DRAFT'), true);
});

test('UTC-NPP-008 - sent notification is immutable', () => {
  assert.equal(NotificationPolicyService.canModify('SENT'), false);
});

test('UTC-NPP-009 - ALL target has no role filter', () => {
  assert.equal(NotificationPolicyService.recipientRoles('ALL'), null);
});

test('UTC-NPP-010 - STUDENT target maps to role 1', () => {
  // R1: ghi [2] ở lần 1
  assert.deepEqual(NotificationPolicyService.recipientRoles('STUDENT'), [1]);
});
