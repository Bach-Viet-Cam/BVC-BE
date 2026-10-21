import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import AuthRepository from '../repository/AuthRepository.ts';
import AuthService from './AuthService.ts';

const googleProfile: Backend.GoogleProfile = {
  providerId: 'google-sub',
  email: 'student@example.com',
  username: 'Student'
};

const pendingUser: Backend.UserRecord = {
  id: 'user-1',
  email: googleProfile.email,
  username: 'Student',
  role: 1,
  status: 'PENDING',
  studentCode: null
};

describe('AuthService.findUserForGoogleLogin', () => {
  it('từ chối email chưa được cấp tài khoản và không tạo identity', async () => {
    mock.method(AuthRepository, 'findIdentityByProvider', async () => null);
    mock.method(AuthRepository, 'findUserByEmail', async () => null);
    const createIdentity = mock.method(AuthRepository, 'createIdentity', async () => null);
    try {
      await assert.rejects(
        AuthService.findUserForGoogleLogin(googleProfile),
        (error: unknown) => error instanceof AppError && error.statusCode === 401
      );
      assert.equal(createIdentity.mock.callCount(), 0);
    } finally {
      mock.restoreAll();
    }
  });

  it('gắn Google identity vào tài khoản đã được admin cấp', async () => {
    mock.method(AuthRepository, 'findIdentityByProvider', async () => null);
    mock.method(AuthRepository, 'findUserByEmail', async () => pendingUser);
    const createIdentity = mock.method(AuthRepository, 'createIdentity', async () => null);
    try {
      assert.equal(await AuthService.findUserForGoogleLogin(googleProfile), pendingUser);
      assert.equal(createIdentity.mock.callCount(), 1);
      assert.deepEqual(createIdentity.mock.calls[0]?.arguments[0], {
        userId: pendingUser.id,
        provider: 'google',
        providerId: googleProfile.providerId
      });
    } finally {
      mock.restoreAll();
    }
  });

  it('không gắn Google identity vào tài khoản bị khóa', async () => {
    mock.method(AuthRepository, 'findIdentityByProvider', async () => null);
    mock.method(AuthRepository, 'findUserByEmail', async () => ({ ...pendingUser, status: 'LOCKED' as const }));
    const createIdentity = mock.method(AuthRepository, 'createIdentity', async () => null);
    try {
      await assert.rejects(
        AuthService.findUserForGoogleLogin(googleProfile),
        (error: unknown) => error instanceof AppError && error.statusCode === 403
      );
      assert.equal(createIdentity.mock.callCount(), 0);
    } finally {
      mock.restoreAll();
    }
  });
});
