import assert from 'node:assert/strict';
import { test } from 'node:test';
import FaqValidation from './FaqValidation.ts';

test('UTC-FQV-001 - input áp dụng giá trị mặc định', () => {
  const result = FaqValidation.input.safeParse({
    question: 'Câu hỏi?',
    answer: 'Câu trả lời.',
    topic: 'COURSE_RULES'
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.instrumentId, null);
    assert.equal(result.data.displayOrder, 0);
    assert.equal(result.data.isActive, true);
  }
});

test('UTC-FQV-002 - input từ chối question rỗng', () => {
  const result = FaqValidation.input.safeParse({
    question: '',
    answer: 'Câu trả lời.',
    topic: 'COURSE_RULES'
  });
  // R1: expected để trống message
  assert.equal(result.success, false);
});

test('UTC-FQV-003 - input từ chối topic ngoài enum', () => {
  const result = FaqValidation.input.safeParse({
    question: 'Câu hỏi?',
    answer: 'Câu trả lời.',
    topic: 'OTHER'
  });
  assert.equal(result.success, false);
});

test('UTC-FQV-004 - input từ chối displayOrder 10000', () => {
  const result = FaqValidation.input.safeParse({
    question: 'Câu hỏi?',
    answer: 'Câu trả lời.',
    topic: 'COURSE_RULES',
    displayOrder: 10000
  });
  assert.equal(result.success, false);
});

test('UTC-FQV-005 - query chấp nhận status HIDDEN', () => {
  const result = FaqValidation.query.safeParse({ status: 'HIDDEN' });
  assert.equal(result.success, true);
});

test('UTC-FQV-006 - update từ chối params.id không phải uuid', () => {
  const result = FaqValidation.update.safeParse({
    body: {},
    params: { id: 'not-a-uuid' },
    query: {}
  });
  // R1: dùng idParams thường cho là đủ
  assert.equal(result.success, false);
});
