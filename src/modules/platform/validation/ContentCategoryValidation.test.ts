import assert from 'node:assert/strict';
import { test } from 'node:test';
import ContentCategoryValidation from './ContentCategoryValidation.ts';

test('UTC-CTV-001 - createSchema chấp nhận parentId null', () => {
  const result = ContentCategoryValidation.createSchema.safeParse({
    body: { name: 'Dân ca', parentId: null },
    params: {},
    query: {}
  });
  assert.equal(result.success, true);
});

test('UTC-CTV-002 - createSchema từ chối field lạ', () => {
  const result = ContentCategoryValidation.createSchema.safeParse({
    body: { name: 'Dân ca', extra: 1 },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-CTV-003 - updateSchema từ chối params.id rỗng', () => {
  const result = ContentCategoryValidation.updateSchema.safeParse({
    body: { name: 'Dân ca' },
    params: { id: '' },
    query: {}
  });
  // R1: quên kiểm tra params
  assert.equal(result.success, false);
});
