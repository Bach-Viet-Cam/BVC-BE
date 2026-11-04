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
