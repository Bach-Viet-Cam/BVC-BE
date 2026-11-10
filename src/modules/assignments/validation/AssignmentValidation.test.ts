import assert from 'node:assert/strict';
import { test } from 'node:test';
import AssignmentValidation from './AssignmentValidation.ts';
import ClassValidation from '../../classes/validation/ClassValidation.ts';

test('review accepts existing readable seed IDs while rejecting blank IDs', () => {
  assert.equal(AssignmentValidation.listSchema.safeParse({ body: undefined, params: {}, query: { classId: 'seed-class-trd301', limit: '100' } }).success, true);
  assert.equal(AssignmentValidation.idSchema.safeParse({ body: undefined, params: { id: 'seed-asg-bonus' }, query: {} }).success, true);
  assert.equal(ClassValidation.memberParamsSchema.safeParse({ body: undefined, params: { id: 'seed-class-trd301', studentId: '6a841ea4-c0cb-4c36-bdcd-bb81bf4b42a8' }, query: {} }).success, true);
  assert.equal(AssignmentValidation.listSchema.safeParse({ body: undefined, params: {}, query: { classId: ' ' } }).success, false);
});

test('assignSchema validates the bulk assign body and removes duplicate ids', () => {
  const parse = (body: unknown) => AssignmentValidation.assignSchema.safeParse({ body, params: {}, query: {} });
  assert.equal(parse({ assignmentIds: [], classIds: ['c1'] }).success, false);
  assert.equal(parse({ assignmentIds: ['a1'], classIds: [] }).success, false);
  assert.equal(parse({ assignmentIds: ['a1'], classIds: Array.from({ length: 51 }, (_, index) => `c${index}`) }).success, false);
  assert.equal(parse({ assignmentIds: [1], classIds: ['c1'] }).success, false);
  const result = parse({ assignmentIds: ['a1', 'a1', 'a2'], classIds: ['c1', 'c1'] });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.body, { assignmentIds: ['a1', 'a2'], classIds: ['c1'] });
  }
});

test('sheetMusicSchema requires exactly one of classId or instrumentId', () => {
  const parse = (query: unknown) => AssignmentValidation.sheetMusicSchema.safeParse({ body: undefined, params: {}, query });
  const instrumentId = '6a841ea4-c0cb-4c36-bdcd-bb81bf4b42a8';
  assert.equal(parse({}).success, false);
  assert.equal(parse({ classId: 'c1', instrumentId }).success, false);
  assert.equal(parse({ classId: 'c1' }).success, true);
  assert.equal(parse({ instrumentId }).success, true);
  assert.equal(parse({ instrumentId: 'abc' }).success, false);
});
