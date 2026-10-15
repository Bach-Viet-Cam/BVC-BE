import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AuthPolicyService from './AuthPolicyService.ts';

describe('AuthPolicyService.resolveLogin', () => {
  it('kích hoạt tài khoản PENDING ở lần đăng nhập đầu tiên', () => {
    assert.deepEqual(AuthPolicyService.resolveLogin('PENDING'), { isAllowed: true, nextStatus: 'ACTIVE' });
  });
  it('giữ nguyên tài khoản ACTIVE', () => {
    assert.deepEqual(AuthPolicyService.resolveLogin('ACTIVE'), { isAllowed: true, nextStatus: 'ACTIVE' });
  });
  it('từ chối tài khoản LOCKED', () => {
    assert.deepEqual(AuthPolicyService.resolveLogin('LOCKED'), { isAllowed: false, nextStatus: 'LOCKED' });
  });
});
