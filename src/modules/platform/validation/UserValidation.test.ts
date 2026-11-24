import assert from 'node:assert/strict';
import { test } from 'node:test';
import UserValidation from './UserValidation.ts';

test('UTC-USV-001 - createSchema chuẩn hóa email về chữ thường', () => {
  const result = UserValidation.createSchema.safeParse({
    body: { email: '  A@FPT.EDU.VN ', username: 'Nguyen A', role: 1 },
    params: {},
    query: {}
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.body.email, 'a@fpt.edu.vn');
  }
});

test('UTC-USV-002 - createSchema từ chối role 4', () => {
  const result = UserValidation.createSchema.safeParse({
    body: { email: 'a@fpt.edu.vn', username: 'Nguyen A', role: 4 },
    params: {},
    query: {}
  });
  // R1: tưởng role 4 là admin
  assert.equal(result.success, false);
});

test('UTC-USV-003 - createSchema từ chối studentCode 21 ký tự', () => {
  const result = UserValidation.createSchema.safeParse({
    body: { email: 'a@fpt.edu.vn', username: 'Nguyen A', role: 1, studentCode: 'a'.repeat(21) },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-USV-004 - listSchema chuyển role chuỗi thành số', () => {
  const result = UserValidation.listSchema.safeParse({
    body: {},
    params: {},
    query: { role: '2' }
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.query.role, 2);
  }
});

test('UTC-USV-005 - updateSchema chấp nhận studentCode null', () => {
  const result = UserValidation.updateSchema.safeParse({
    body: { studentCode: null },
    params: { id: 'u-1' },
    query: {}
  });
  assert.equal(result.success, true);
});

test('UTC-USV-006 - importSchema từ chối rows rỗng', () => {
  const result = UserValidation.importSchema.safeParse({
    body: { rows: [], mode: 'skip', dryRun: false },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});

test('UTC-USV-007 - importSchema từ chối quá 1000 dòng', () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    rowNumber: i + 1,
    studentCode: `S${i}`,
    username: `U${i}`,
    email: `u${i}@test.com`
  }));
  const result = UserValidation.importSchema.safeParse({
    body: { rows, mode: 'skip', dryRun: false },
    params: {},
    query: {}
  });
  // R1: ghi maxRows=1000 nhưng test để 100
  assert.equal(result.success, false);
});

test('UTC-USV-008 - importSchema từ chối mode delete', () => {
  const result = UserValidation.importSchema.safeParse({
    body: {
      rows: [{ rowNumber: 1, studentCode: 'S1', username: 'U1', email: 'u1@test.com' }],
      mode: 'delete',
      dryRun: false
    },
    params: {},
    query: {}
  });
  assert.equal(result.success, false);
});
