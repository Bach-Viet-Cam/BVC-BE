import assert from 'node:assert/strict';
import { test } from 'node:test';
import ClassValidation from './ClassValidation.ts';

const parse = (body: unknown) => ClassValidation.createClassSchema.safeParse({ body, params: {}, query: {} });
const base = { name: 'DNH103.M2.H1', cohort: 'SP27-H1', instrumentId: '6a841ea4-c0cb-4c36-bdcd-bb81bf4b42a8' };
const item = { title: 'Bài 1', kind: 'OTHER', status: 'DRAFT' };

test('createClassSchema defaults assignments to an empty list', () => {
  const result = parse(base);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.body.assignments, []);
  }
});

test('createClassSchema rejects invalid copied assignments', () => {
  assert.equal(parse({ ...base, assignments: [{ title: 'Bài 1', kind: 'SOLO', status: 'CLOSED' }] }).success, false);
  assert.equal(parse({ ...base, assignments: [{ title: '  ', kind: 'OTHER', status: 'DRAFT' }] }).success, false);
});

test('createClassSchema limits copied assignments to 50', () => {
  assert.equal(parse({ ...base, assignments: Array.from({ length: 51 }, () => item) }).success, false);
  assert.equal(parse({ ...base, assignments: Array.from({ length: 50 }, () => item) }).success, true);
});

test('createClassSchema accepts sourceClassId and normalizes optional assignment fields', () => {
  const result = parse({ ...base, sourceClassId: 'seed-class-trd301', assignments: [{ title: 'Bài 1', kind: 'OTHER', status: 'PUBLISHED', requiredBpm: 90 }] });
  assert.equal(result.success, true);
  if (result.success) {
    const [first] = result.data.body.assignments;
    assert.equal(first.description, null);
    assert.equal(first.sheetMusicId, null);
    assert.equal(first.requiredBpm, 90);
  }
});
