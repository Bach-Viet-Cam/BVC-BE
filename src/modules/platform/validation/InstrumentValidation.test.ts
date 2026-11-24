import assert from 'node:assert/strict';
import { test } from 'node:test';
import InstrumentValidation from './InstrumentValidation.ts';

test('UTC-INV-001 - createSchema chuyển code sang chữ hoa', () => {
  const result = InstrumentValidation.createSchema.safeParse({
    body: { code: 'dn-01', name: 'Đàn nhị' },
    params: {},
    query: {}
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.body.code, 'DN-01');
  }
});

test('UTC-INV-002 - createSchema từ chối code có dấu cách', () => {
  const result = InstrumentValidation.createSchema.safeParse({
    body: { code: 'DN 01', name: 'Đàn nhị' },
    params: {},
    query: {}
  });
  // R1: regex cấm dấu cách
  assert.equal(result.success, false);
});

test('UTC-INV-003 - createSchema từ chối name chỉ có dấu cách', () => {
  const result = InstrumentValidation.createSchema.safeParse({
    body: { code: 'DN01', name: '   ' },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-INV-004 - createSchema từ chối description 256 ký tự', () => {
  const result = InstrumentValidation.createSchema.safeParse({
    body: { code: 'DN01', name: 'Đàn nhị', description: 'a'.repeat(256) },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-INV-005 - updateSchema từ chối field lạ code', () => {
  const result = InstrumentValidation.updateSchema.safeParse({
    body: { name: 'Đàn nhị', code: 'DN' },
    params: { id: 'ins-1' },
    query: {}
  });
  // R1: quên updateSchema strict
  assert.equal(result.success, false);
});

test('UTC-INV-006 - tunesSchema từ chối pitch bằng 0', () => {
  const result = InstrumentValidation.tunesSchema.safeParse({
    body: { tunes: [{ tuneName: 'Re 4', pitch: 0 }] },
    params: { id: 'ins-1' },
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-INV-007 - tunesSchema từ chối 41 phần tử', () => {
  const tunes = Array.from({ length: 41 }, () => ({ tuneName: 'Re 4', pitch: 1 }));
  const result = InstrumentValidation.tunesSchema.safeParse({
    body: { tunes },
    params: { id: 'ins-1' },
    query: {}
  });
  assert.equal(result.success, false);
});
