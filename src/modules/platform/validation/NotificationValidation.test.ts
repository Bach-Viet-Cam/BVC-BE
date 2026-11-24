import assert from 'node:assert/strict';
import { test } from 'node:test';
import NotificationValidation from './NotificationValidation.ts';

const validBody = {
  title: 'Thông báo',
  body: 'Nội dung thông báo',
  type: 'ANNOUNCEMENT',
  target: 'ALL',
  scheduledAt: '2026-11-18T08:00:00+07:00',
  action: 'send'
};

test('UTC-NTV-001 - createSchema chấp nhận body hợp lệ có scheduledAt', () => {
  const result = NotificationValidation.createSchema.safeParse({ body: validBody, params: {}, query: {} });
  assert.equal(result.success, true);
});

test('UTC-NTV-002 - createSchema từ chối title rỗng', () => {
  const result = NotificationValidation.createSchema.safeParse({
    body: { ...validBody, title: '' },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-NTV-003 - createSchema từ chối body dài 2001 ký tự', () => {
  const result = NotificationValidation.createSchema.safeParse({
    body: { ...validBody, body: 'a'.repeat(2001) },
    params: {},
    query: {}
  });
  // R1: đếm nhầm 2000
  assert.equal(result.success, false);
});

test('UTC-NTV-004 - createSchema từ chối type ngoài enum', () => {
  const result = NotificationValidation.createSchema.safeParse({
    body: { ...validBody, type: 'NEWS' },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-NTV-005 - createSchema từ chối field lạ trong body', () => {
  const result = NotificationValidation.createSchema.safeParse({
    body: { ...validBody, extra: 1 },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-NTV-006 - listSchema từ chối pageSize 101', () => {
  const result = NotificationValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { pageSize: '101' }
  });
  // R1: tưởng coerce bỏ qua max
  assert.equal(result.success, false);
});

test('UTC-NTV-007 - listSchema chuyển page chuỗi thành số', () => {
  const result = NotificationValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { page: '2' }
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.query.page, 2);
  }
});

test('UTC-NTV-008 - myListSchema chuyển unreadOnly thành boolean', () => {
  const result = NotificationValidation.myListSchema.safeParse({
    body: {},
    params: {},
    query: { unreadOnly: 'true' }
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.query.unreadOnly, true);
  }
});
