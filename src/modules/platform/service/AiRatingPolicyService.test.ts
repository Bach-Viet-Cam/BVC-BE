import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Prisma } from '@prisma/client';
import AiRatingPolicyService from './AiRatingPolicyService.ts';
import AiRatingValidation from '../validation/AiRatingValidation.ts';
import AiRatingModel from '../model/AiRatingModel.ts';
import PracticeConstant from '../../practice/constant/PracticeConstant.ts';

const feedback = { status: 'COMPLETED', aiFeedback: 'Cần giữ đều nhịp ở câu cuối.', result: null, attempt: 1, evaluationId: 'eval-1', analyzedAt: new Date('2026-11-12T10:00:00Z') };
test('chỉ đánh giá phản hồi thực, lưu phiên bản riêng khi AI chạy lại', () => {
  const first = AiRatingPolicyService.feedback(feedback)!;
  assert.equal(first.key.length, 64);
  assert.equal(AiRatingPolicyService.feedback({...feedback, status: 'PROCESSING'}), null);
  assert.equal(AiRatingPolicyService.feedback({...feedback, aiFeedback: ''}), null);
  assert.equal(AiRatingPolicyService.feedback({...feedback, aiFeedback: PracticeConstant.fallbackFeedback}), null);
  assert.notEqual(AiRatingPolicyService.feedback({...feedback, evaluationId: 'eval-2'})?.key, first.key);
  assert.notEqual(AiRatingPolicyService.feedback({...feedback, aiFeedback: 'Cao độ chuẩn.'})?.key, first.key);
  assert.equal(AiRatingPolicyService.feedback({...feedback, aiFeedback: null, result: {aiFeedback: feedback.aiFeedback}})?.text, feedback.aiFeedback);
});
test('API từ chối sao không hợp lệ và nhận xét text của sinh viên', () => {
  const base = {feedbackKey: 'a'.repeat(64), accuracyStars: 4, satisfactionStars: 5};
  assert.equal(AiRatingValidation.input.safeParse(base).success, true);
  for (const value of [0, 6, 1.5, '5']) assert.equal(AiRatingValidation.input.safeParse({...base, accuracyStars: value}).success, false);
  assert.throws(() => AiRatingPolicyService.assertComment(1, 'nhận xét'));
  assert.doesNotThrow(() => AiRatingPolicyService.assertComment(1, undefined));
  assert.doesNotThrow(() => AiRatingPolicyService.assertComment(2, 'Nhận xét về AI'));
});
test('chỉ sinh viên sở hữu hoặc giảng viên được phân công xem và đánh giá', () => {
  const row = { studentId: 'student', assignment: { deletedAt: null, class: {ownerId: 'teacher', coLecturers: [{lecturerId: 'co-teacher'}]} } } as unknown as Prisma.SubmissionGetPayload<{include: typeof AiRatingModel.sourceInclude}>;
  const actor = (userId: string, role: number) => ({userId, role, username: userId, email: 'test@example.test'}) as Backend.UserDTO;
  assert.doesNotThrow(() => AiRatingPolicyService.assertAccess(actor('student', 1), row));
  assert.doesNotThrow(() => AiRatingPolicyService.assertAccess(actor('teacher', 2), row));
  assert.doesNotThrow(() => AiRatingPolicyService.assertAccess(actor('co-teacher', 2), row));
  assert.throws(() => AiRatingPolicyService.assertAccess(actor('stranger', 1), row));
  assert.throws(() => AiRatingPolicyService.assertAccess(actor('stranger', 2), row));
  assert.throws(() => AiRatingPolicyService.assertAccess(actor('admin', 3), row));
});
