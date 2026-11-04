import assert from 'node:assert/strict';
import { test } from 'node:test';
import FaqPolicyService from './FaqPolicyService.ts';
import FaqValidation from '../validation/FaqValidation.ts';

test('FAQ uniqueness normalizes Vietnamese Unicode, case and spacing but preserves accents', () => {
  assert.equal(FaqPolicyService.questionKey('  CÁCH   nộp bài?  '), FaqPolicyService.questionKey('cách nộp bài?'.normalize('NFD')));
  assert.notEqual(FaqPolicyService.questionKey('Cách nộp bài?'), FaqPolicyService.questionKey('Cach nop bai?'));
});
test('FAQ rejects invalid topic, blank answer and non-integer order', () => {
  const valid = { question: 'Cách nộp bài?', answer: 'Mở bài tập.', topic: 'ASSIGNMENTS', displayOrder: 0 };
  assert(FaqValidation.input.safeParse(valid).success);
  for (const invalid of [{...valid, topic: 'OTHER'}, {...valid, answer: ' '}, {...valid, displayOrder: 0.2}]) {
    assert.equal(FaqValidation.input.safeParse(invalid).success, false);
  }
});
test('FAQ partial updates do not republish hidden entries or erase instrument/order', () => {
  const update = FaqValidation.update.parse({body: {question: 'Đổi câu hỏi'}, params: {id: 'ea1e03a1-76f0-448e-8b9f-33841de6f190'}, query: {}});
  assert.deepEqual(update.body, {question: 'Đổi câu hỏi'});
});
