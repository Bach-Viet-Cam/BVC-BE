import { describe, expect, it } from 'vitest';
import ChallengeConstant from '../../src/modules/challenges/constant/ChallengeConstant.ts';

describe('ChallengeConstant', () => {
  it('words the MSG-09 failure by action', () => {
    expect(ChallengeConstant.messages.PUBLISH_FAILED).toBe('Đăng thử thách thất bại. Vui lòng thử lại.');
    expect(ChallengeConstant.messages.SAVE_DRAFT_FAILED).toBe('Lưu nháp thử thách thất bại. Vui lòng thử lại.');
  });

  it('links notifications to the community challenge page', () => {
    expect(ChallengeConstant.notifications.link('abc')).toBe('/community/challenges/abc');
  });
});
