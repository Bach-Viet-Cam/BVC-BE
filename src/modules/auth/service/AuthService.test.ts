/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are partial Prisma records */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import jwt from 'jsonwebtoken';
import EnvConfig from '../../../config/EnvConfig.ts';
import AppError from '../../../utils/AppError.ts';
import AuthRepository from '../repository/AuthRepository.ts';
import AuthPolicyService from './AuthPolicyService.ts';
import AuthService from './AuthService.ts';

const LOCKED = 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.';
const JWT_INVALID = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
const REFRESH_INVALID = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
const GOOGLE_INVALID = 'Mã xác thực Google không hợp lệ hoặc đã hết hạn.';
const NOT_PROVISIONED = 'Email này chưa có tài khoản trong hệ thống.';
const GOOGLE_NOT_CONFIGURED = 'Máy chủ chưa được cấu hình Google Client ID.';

function createMockUser(overrides: Partial<Backend.UserRecord> = {}): Backend.UserRecord {
  return {
    id: 'SV-1',
    email: 'sv1@fpt.edu.vn',
    username: 'sv1',
    role: 1,
    status: 'ACTIVE',
    studentCode: 'HE194043',
    ...overrides
  } as Backend.UserRecord;
}

const googleProfile: Backend.GoogleProfile = {
  providerId: 'google-sub-1',
  email: 'sv1@fpt.edu.vn',
  username: 'Sinh viên 1'
};

const env = EnvConfig as any;
const originalEnv = {
  nodeEnv: env.nodeEnv,
  googleClientId: env.googleClientId,
  refreshTokenExpiresInDays: env.refreshTokenExpiresInDays
};

function mockGoogleTicket(payload: unknown) {
  return mock.method(AuthService.googleClient, 'verifyIdToken', async () => ({ getPayload: () => payload }) as any);
}

function isAppError(statusCode: number, message: string) {
  return (err: unknown) => err instanceof AppError && err.statusCode === statusCode && err.message === message;
}

describe('AuthService (Đăng nhập Google & phiên làm việc)', () => {
  afterEach(() => {
    Object.assign(env, originalEnv);
    mock.restoreAll();
  });

  describe('AuthPolicyService.resolveLogin', () => {
    it('giữ nguyên tài khoản ACTIVE', () => {
      assert.deepEqual(AuthPolicyService.resolveLogin('ACTIVE'), { isAllowed: true, nextStatus: 'ACTIVE' });
    });

    it('kích hoạt tài khoản PENDING ở lần đăng nhập đầu tiên', () => {
      assert.deepEqual(AuthPolicyService.resolveLogin('PENDING'), { isAllowed: true, nextStatus: 'ACTIVE' });
    });

    it('từ chối tài khoản LOCKED', () => {
      assert.deepEqual(AuthPolicyService.resolveLogin('LOCKED'), { isAllowed: false, nextStatus: 'LOCKED' });
    });
  });

  describe('createAccessToken', () => {
    it('ký JWT chứa userId, role và hết hạn sau 15 phút', () => {
      const payload = jwt.verify(AuthService.createAccessToken(createMockUser()), 'unit-test-secret') as jwt.JwtPayload;

      assert.equal(payload.userId, 'SV-1');
      assert.equal(payload.role, 1);
      assert.equal(payload.exp! - payload.iat!, 900);
    });
  });

  describe('createRefreshToken / hashToken', () => {
    it('mỗi lần tạo refresh token là một chuỗi hex 96 ký tự khác nhau', () => {
      const first = AuthService.createRefreshToken();
      const second = AuthService.createRefreshToken();

      assert.match(first, /^[0-9a-f]{96}$/);
      assert.notEqual(first, second);
    });

    it('hashToken trả về SHA-256 hex cố định', () => {
      assert.equal(AuthService.hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
  });

  describe('getRefreshExpiryDate / getRefreshCookieOptions', () => {
    it('ngày hết hạn refresh token là 7 ngày sau hiện tại', () => {
      env.refreshTokenExpiresInDays = 7;

      const days = (AuthService.getRefreshExpiryDate().getTime() - Date.now()) / 86_400_000;
      assert.ok(days > 6.99 && days <= 7.01);
    });

    it('cookie ở môi trường production bật secure và maxAge 7 ngày', () => {
      env.nodeEnv = 'production';
      env.refreshTokenExpiresInDays = 7;

      assert.deepEqual(AuthService.getRefreshCookieOptions(), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 604800
      });
    });
  });

  describe('setRefreshTokenCookie', () => {
    it('ghi header Set-Cookie với HttpOnly, SameSite=Lax và path /api/v1/auth', () => {
      const headers: Record<string, string> = {};
      const response = { setHeader: (name: string, value: string) => { headers[name] = value; } } as any;

      AuthService.setRefreshTokenCookie(response, 'r1');

      assert.match(headers['Set-Cookie'], /^refreshToken=r1; Max-Age=\d+; Path=\/api\/v1\/auth; HttpOnly; SameSite=Lax/);
    });
  });

  describe('verifyGoogleCredential', () => {
    it('báo lỗi 400 khi máy chủ chưa cấu hình Google Client ID', async () => {
      env.googleClientId = '';

      await assert.rejects(AuthService.verifyGoogleCredential('google-id-token'), isAppError(400, GOOGLE_NOT_CONFIGURED));
    });

    it('xác thực credential thành công và chuyển email về chữ thường', async () => {
      env.googleClientId = 'client-1';
      const verifyMock = mockGoogleTicket({ sub: 'google-sub-1', email: 'SV1@FPT.EDU.VN', email_verified: true, name: 'Sinh viên 1' });

      const result = await AuthService.verifyGoogleCredential('google-id-token');

      assert.deepEqual(result, googleProfile);
      assert.deepEqual(verifyMock.mock.calls[0].arguments[0], { idToken: 'google-id-token', audience: 'client-1' });
    });

    it('báo lỗi 401 khi email Google chưa được xác minh', async () => {
      env.googleClientId = 'client-1';
      mockGoogleTicket({ sub: 'google-sub-1', email: 'sv1@fpt.edu.vn', email_verified: false });

      await assert.rejects(AuthService.verifyGoogleCredential('google-id-token'), isAppError(401, GOOGLE_INVALID));
    });
  });

  describe('findUserForGoogleLogin', () => {
    it('trả về user đã liên kết Google identity mà không tìm theo email', async () => {
      const findIdentityMock = mock.method(AuthRepository, 'findIdentityByProvider', async () => ({ user: createMockUser() }) as any);
      const findEmailMock = mock.method(AuthRepository, 'findUserByEmail', async () => null);

      const result = await AuthService.findUserForGoogleLogin(googleProfile);

      assert.equal(result.id, 'SV-1');
      assert.deepEqual(findIdentityMock.mock.calls[0].arguments, ['google', 'google-sub-1']);
      assert.equal(findEmailMock.mock.callCount(), 0);
    });

    it('liên kết Google identity cho user đã được admin import theo email', async () => {
      mock.method(AuthRepository, 'findIdentityByProvider', async () => null);
      mock.method(AuthRepository, 'findUserByEmail', async () => createMockUser());
      const createIdentityMock = mock.method(AuthRepository, 'createIdentity', async () => ({}) as any);

      const result = await AuthService.findUserForGoogleLogin(googleProfile);

      assert.equal(result.id, 'SV-1');
      assert.deepEqual(createIdentityMock.mock.calls[0].arguments[0], { userId: 'SV-1', provider: 'google', providerId: 'google-sub-1' });
    });

    it('báo lỗi 403 và KHÔNG liên kết identity khi tài khoản bị khóa', async () => {
      mock.method(AuthRepository, 'findIdentityByProvider', async () => null);
      mock.method(AuthRepository, 'findUserByEmail', async () => createMockUser({ status: 'LOCKED' }));
      const createIdentityMock = mock.method(AuthRepository, 'createIdentity', async () => ({}) as any);

      await assert.rejects(AuthService.findUserForGoogleLogin(googleProfile), isAppError(403, LOCKED));
      assert.equal(createIdentityMock.mock.callCount(), 0);
    });

    it('báo lỗi 401 ACCOUNT_NOT_PROVISIONED khi email chưa có tài khoản và không cho tạo mới', async () => {
      mock.method(AuthRepository, 'findIdentityByProvider', async () => null);
      mock.method(AuthRepository, 'findUserByEmail', async () => null);

      await assert.rejects(
        AuthService.findUserForGoogleLogin(googleProfile, false),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 401 &&
          err.message === NOT_PROVISIONED &&
          (err.details as any)?.reason === 'ACCOUNT_NOT_PROVISIONED'
      );
    });

    it('tạo học sinh mới kèm Google identity khi người dùng đồng ý tạo tài khoản', async () => {
      mock.method(AuthRepository, 'findIdentityByProvider', async () => null);
      mock.method(AuthRepository, 'findUserByEmail', async () => null);
      const createStudentMock = mock.method(AuthRepository, 'createStudentWithIdentity', async () => createMockUser({ id: 'SV-NEW' }));

      const result = await AuthService.findUserForGoogleLogin(googleProfile, true);

      assert.equal(result.id, 'SV-NEW');
      assert.deepEqual(createStudentMock.mock.calls[0].arguments[0], {
        email: 'sv1@fpt.edu.vn',
        username: 'Sinh viên 1',
        role: 1,
        provider: 'google',
        providerId: 'google-sub-1'
      });
    });
  });

  describe('activateOnLogin', () => {
    it('chuyển tài khoản PENDING sang ACTIVE khi đăng nhập', async () => {
      const markLoggedInMock = mock.method(AuthRepository, 'markLoggedIn', async () => ({}) as any);

      const result = await AuthService.activateOnLogin(createMockUser({ status: 'PENDING' }));

      assert.equal(result.status, 'ACTIVE');
      assert.deepEqual(markLoggedInMock.mock.calls[0].arguments, ['SV-1', 'ACTIVE']);
    });

    it('báo lỗi 403 và KHÔNG ghi nhận đăng nhập khi tài khoản bị khóa', async () => {
      const markLoggedInMock = mock.method(AuthRepository, 'markLoggedIn', async () => ({}) as any);

      await assert.rejects(AuthService.activateOnLogin(createMockUser({ status: 'LOCKED' })), isAppError(403, LOCKED));
      assert.equal(markLoggedInMock.mock.callCount(), 0);
    });
  });

  describe('createSessionForUser', () => {
    it('lưu phiên với refresh token đã băm và trả về access token của user', async () => {
      const createSessionMock = mock.method(AuthRepository, 'createSession', async () => ({}) as any);

      const tokens = await AuthService.createSessionForUser(createMockUser());

      const sessionInput = createSessionMock.mock.calls[0].arguments[0] as any;
      assert.equal(sessionInput.userId, 'SV-1');
      assert.equal(sessionInput.refreshHash, AuthService.hashToken(tokens.refreshToken));
      assert.equal((jwt.verify(tokens.accessToken, 'unit-test-secret') as jwt.JwtPayload).userId, 'SV-1');
    });
  });

  describe('authenticateWithGoogle', () => {
    it('đăng nhập thành công: kích hoạt tài khoản PENDING, tạo phiên và trả về thông tin user', async () => {
      mock.method(AuthService, 'verifyGoogleCredential', async () => googleProfile);
      mock.method(AuthRepository, 'findIdentityByProvider', async () => ({ user: createMockUser({ status: 'PENDING' }) }) as any);
      const markLoggedInMock = mock.method(AuthRepository, 'markLoggedIn', async () => ({}) as any);
      const createSessionMock = mock.method(AuthRepository, 'createSession', async () => ({}) as any);

      const result = await AuthService.authenticateWithGoogle({ credential: 'token' });

      assert.deepEqual(result.user, { userId: 'SV-1', username: 'sv1', email: 'sv1@fpt.edu.vn', role: 1 });
      assert.deepEqual(markLoggedInMock.mock.calls[0].arguments, ['SV-1', 'ACTIVE']);
      assert.equal(createSessionMock.mock.callCount(), 1);
    });
  });

  describe('refreshAccessToken', () => {
    it('báo lỗi 401 khi không có refresh token (thiếu cookie)', async () => {
      await assert.rejects(AuthService.refreshAccessToken(undefined), isAppError(401, REFRESH_INVALID));
    });

    it('báo lỗi 401 khi phiên không tồn tại, đã thu hồi hoặc hết hạn', async () => {
      const findSessionMock = mock.method(AuthRepository, 'findActiveSessionByHash', async () => null);

      await assert.rejects(AuthService.refreshAccessToken('r-old'), isAppError(401, REFRESH_INVALID));
      assert.deepEqual(findSessionMock.mock.calls[0].arguments, [AuthService.hashToken('r-old')]);
    });

    it('xoay vòng refresh token: cấp token mới và cập nhật hash của phiên', async () => {
      mock.method(AuthRepository, 'findActiveSessionByHash', async () => ({ id: 'sess-1', user: createMockUser() }) as any);
      const rotateMock = mock.method(AuthRepository, 'rotateSession', async () => ({}) as any);

      const result = await AuthService.refreshAccessToken('r-old');

      const rotateInput = rotateMock.mock.calls[0].arguments[0] as any;
      assert.notEqual(result.refreshToken, 'r-old');
      assert.equal(rotateInput.sessionId, 'sess-1');
      assert.equal(rotateInput.refreshHash, AuthService.hashToken(result.refreshToken));
    });

    it('báo lỗi 403 và KHÔNG xoay vòng phiên khi tài khoản bị khóa', async () => {
      mock.method(AuthRepository, 'findActiveSessionByHash', async () => ({ id: 'sess-1', user: createMockUser({ status: 'LOCKED' }) }) as any);
      const rotateMock = mock.method(AuthRepository, 'rotateSession', async () => ({}) as any);

      await assert.rejects(AuthService.refreshAccessToken('r-old'), isAppError(403, LOCKED));
      assert.equal(rotateMock.mock.callCount(), 0);
    });
  });

  describe('logout', () => {
    it('giá trị biên: không có refresh token thì không gọi repository', async () => {
      const findSessionMock = mock.method(AuthRepository, 'findActiveSessionByHash', async () => null);

      await AuthService.logout(undefined);

      assert.equal(findSessionMock.mock.callCount(), 0);
    });

    it('thu hồi phiên tương ứng với refresh token', async () => {
      mock.method(AuthRepository, 'findActiveSessionByHash', async () => ({ id: 'sess-1', user: createMockUser() }) as any);
      const revokeMock = mock.method(AuthRepository, 'revokeSession', async () => ({}) as any);

      await AuthService.logout('r1');

      assert.equal(revokeMock.mock.callCount(), 1);
      assert.deepEqual(revokeMock.mock.calls[0].arguments, ['sess-1']);
    });
  });

  describe('verifyAccessToken', () => {
    it('giải mã access token hợp lệ', () => {
      const payload = AuthService.verifyAccessToken(AuthService.createAccessToken(createMockUser())) as jwt.JwtPayload;

      assert.equal(payload.userId, 'SV-1');
    });

    it('báo lỗi 401 khi token sai định dạng', () => {
      assert.throws(() => AuthService.verifyAccessToken('abc.def.ghi'), isAppError(401, JWT_INVALID));
    });

    it('báo lỗi 401 khi token được ký bằng secret khác', () => {
      const foreignToken = jwt.sign({ userId: 'SV-1' }, 'other-secret');

      assert.throws(() => AuthService.verifyAccessToken(foreignToken), isAppError(401, JWT_INVALID));
    });
  });

  describe('getAuthenticatedUser', () => {
    it('trả về thông tin user đang hoạt động', async () => {
      mock.method(AuthRepository, 'findUserById', async () => createMockUser());

      const result = await AuthService.getAuthenticatedUser('SV-1');

      assert.deepEqual(result, { userId: 'SV-1', username: 'sv1', email: 'sv1@fpt.edu.vn', role: 1 });
    });

    it('báo lỗi 401 khi user đã bị xóa', async () => {
      mock.method(AuthRepository, 'findUserById', async () => null);

      await assert.rejects(AuthService.getAuthenticatedUser('SV-X'), isAppError(401, JWT_INVALID));
    });

    it('báo lỗi 403 khi tài khoản bị khóa', async () => {
      mock.method(AuthRepository, 'findUserById', async () => createMockUser({ status: 'LOCKED' }));

      await assert.rejects(AuthService.getAuthenticatedUser('SV-1'), isAppError(403, LOCKED));
    });
  });
});
