import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import UserPolicyService from './UserPolicyService.ts';

describe('UserPolicyService.canChangeRole', () => {
  const base = { actorId: 'a', targetId: 'b', currentRole: 1, nextRole: 2, targetOwnsActiveClasses: false };
  it('cho phép đổi vai trò người khác', () => {
    assert.equal(UserPolicyService.canChangeRole(base).isAllowed, true);
  });
  it('không cho admin đổi vai trò của chính mình (GBR-30)', () => {
    assert.equal(UserPolicyService.canChangeRole({ ...base, targetId: 'a', currentRole: 3, nextRole: 2 }).isAllowed, false);
  });
  it('không cho đổi vai trò giảng viên đang có lớp active (GBR-30)', () => {
    const result = UserPolicyService.canChangeRole({ ...base, currentRole: 2, nextRole: 1, targetOwnsActiveClasses: true });
    assert.equal(result.isAllowed, false);
    assert.ok(result.message);
  });
  it('giữ nguyên vai trò luôn hợp lệ', () => {
    assert.equal(UserPolicyService.canChangeRole({ ...base, targetId: 'a', currentRole: 3, nextRole: 3 }).isAllowed, true);
  });
});

describe('UserPolicyService.canLock', () => {
  it('không cho tự khóa (GBR-09)', () => {
    assert.equal(UserPolicyService.canLock({ actorId: 'a', targetId: 'a' }), false);
  });
  it('cho khóa người khác', () => {
    assert.equal(UserPolicyService.canLock({ actorId: 'a', targetId: 'b' }), true);
  });
});

describe('UserPolicyService.canChangeEmail', () => {
  it('không cho đổi email sau lần đăng nhập đầu (GBR-29)', () => {
    assert.equal(UserPolicyService.canChangeEmail({ hasEverSignedIn: true }), false);
  });
  it('cho đổi email khi chưa từng đăng nhập', () => {
    assert.equal(UserPolicyService.canChangeEmail({ hasEverSignedIn: false }), true);
  });
});
