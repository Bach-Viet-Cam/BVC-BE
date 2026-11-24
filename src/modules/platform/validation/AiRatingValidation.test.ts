import assert from 'node:assert/strict';
import { test } from 'node:test';
import AiRatingValidation from './AiRatingValidation.ts';

test('UTC-AIV-001 - input chấp nhận feedbackKey hex và 5 sao', () => {
  const result = AiRatingValidation.input.safeParse({
    feedbackKey: 'a'.repeat(64),
    accuracyStars: 5,
    satisfactionStars: 5
  });
  assert.equal(result.success, true);
});

test('UTC-AIV-002 - input từ chối accuracyStars 6', () => {
  const result = AiRatingValidation.input.safeParse({
    feedbackKey: 'a'.repeat(64),
    accuracyStars: 6,
    satisfactionStars: 5
  });
  // R1: tưởng cho phép 6 sao
  assert.equal(result.success, false);
});
