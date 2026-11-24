import assert from 'node:assert/strict';
import { test } from 'node:test';
import SystemConfigValidation from './SystemConfigValidation.ts';

test('UTC-SCV-001 - listSchema chấp nhận group SCORING và giá trị mặc định', () => {
  const result = SystemConfigValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { group: 'SCORING' }
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.query.sortBy, 'group');
    assert.equal(result.data.query.sortDir, 'asc');
  }
});

test('UTC-SCV-002 - listSchema từ chối group ngoài enum', () => {
  const result = SystemConfigValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { group: 'OTHER' }
  });
  // R1: tưởng enum nhận chuỗi khác
  assert.equal(result.success, false);
});

test('UTC-SCV-003 - listSchema từ chối q dài 101 ký tự', () => {
  const result = SystemConfigValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { q: 'a'.repeat(101) }
  });
  assert.equal(result.success, false);
});

test('UTC-SCV-004 - updateSchema chấp nhận body value hợp lệ', () => {
  const result = SystemConfigValidation.updateSchema.safeParse({
    body: { value: '70' },
    params: { id: 'cfg-1' },
    query: {}
  });
  assert.equal(result.success, true);
});

test('UTC-SCV-005 - updateSchema từ chối field lạ trong body', () => {
  const result = SystemConfigValidation.updateSchema.safeParse({
    body: { value: '70', extra: 1 },
    params: { id: 'cfg-1' },
    query: {}
  });
  // R1: quên schema strict
  assert.equal(result.success, false);
});
