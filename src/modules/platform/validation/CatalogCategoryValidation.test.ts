import assert from 'node:assert/strict';
import { test } from 'node:test';
import CatalogCategoryValidation from './CatalogCategoryValidation.ts';

test('UTC-CCV-001 - listSchema áp dụng giá trị mặc định', () => {
  const result = CatalogCategoryValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { type: 'GENRE' }
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.query.status, 'all');
    assert.equal(result.data.query.page, 1);
    assert.equal(result.data.query.limit, 50);
  }
});

test('UTC-CCV-002 - listSchema từ chối type YEAR', () => {
  const result = CatalogCategoryValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { type: 'YEAR' }
  });
  assert.equal(result.success, false);
});

test('UTC-CCV-003 - createSchema từ chối name rỗng', () => {
  const result = CatalogCategoryValidation.createSchema.safeParse({
    body: { type: 'GENRE', name: '' },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-CCV-004 - createSchema từ chối description 256 ký tự', () => {
  const result = CatalogCategoryValidation.createSchema.safeParse({
    body: { type: 'GENRE', name: 'Dân ca', description: 'a'.repeat(256) },
    params: {},
    query: {}
  });
  // R1: nhầm với limit 255
  assert.equal(result.success, false);
});

test('UTC-CCV-005 - updateSchema từ chối field lạ extra', () => {
  const result = CatalogCategoryValidation.updateSchema.safeParse({
    body: { name: 'Dân ca', extra: 1 },
    params: { id: 'cat-1' },
    query: {}
  });
  assert.equal(result.success, false);
});
