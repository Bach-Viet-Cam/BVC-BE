import { test } from 'node:test';
import assert from 'node:assert/strict';
import PracticeChallengeResolver from './PracticeChallengeResolver.ts';

const challenge = (id: string, maxSubmissions: number, statuses: Practice.SubmissionStatus[] = []): Practice.ChallengeCandidate => ({
  id, maxSubmissions, submissions: statuses.map((status) => ({ status }))
});

test('UC-18: chọn thử thách đầu tiên còn lượt nộp', () => {
  assert.equal(PracticeChallengeResolver.pickChallengeId([challenge('chl-1', 3)], 'SOLO'), 'chl-1');
  const firstFull = [challenge('chl-1', 1, ['COMPLETED']), challenge('chl-2', 3)];
  assert.equal(PracticeChallengeResolver.pickChallengeId(firstFull, 'SOLO'), 'chl-2');
});

test('UC-18: lượt bị từ chối hoặc lỗi không trừ vào số lần nộp', () => {
  assert.equal(PracticeChallengeResolver.pickChallengeId([challenge('chl-1', 1, ['REJECTED', 'FAILED'])], 'SOLO'), 'chl-1');
  assert.equal(PracticeChallengeResolver.pickChallengeId([challenge('chl-1', 2, ['COMPLETED', 'PROCESSING'])], 'SOLO'), null);
});

test('UC-18: không có thử thách đang mở hoặc bản nộp hòa tấu thì không gắn', () => {
  assert.equal(PracticeChallengeResolver.pickChallengeId([], 'SOLO'), null);
  assert.equal(PracticeChallengeResolver.pickChallengeId([challenge('chl-1', 3)], 'ENSEMBLE'), null);
});
