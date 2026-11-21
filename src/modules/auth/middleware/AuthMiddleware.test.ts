/* eslint-disable @typescript-eslint/no-explicit-any -- Express request / response are faked with plain objects */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import AuthService from '../service/AuthService.ts';
import { attachOptionalUser, requireAuthenticatedUser, requireRoles } from './AuthMiddleware.ts';

const JWT_INVALID = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
const FORBIDDEN = 'Bạn không có quyền thực hiện thao tác này.';
const LOCKED = 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.';

const studentDto: Backend.UserDTO = { userId: 'SV-1', username: 'sv1', email: 'sv1@fpt.edu.vn', role: 1 } as Backend.UserDTO;

function createRequest(authorization?: string): any {
  return { headers: authorization === undefined ? {} : { authorization } };
}

function mockValidToken() {
  return {
    verifyMock: mock.method(AuthService, 'verifyAccessToken', () => ({ userId: 'SV-1' })),
    loadUserMock: mock.method(AuthService, 'getAuthenticatedUser', async () => studentDto)
  };
}

describe('AuthMiddleware', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('requireAuthenticatedUser', () => {
    it('gắn request.auth.user và gọi next() khi Bearer token hợp lệ', async () => {
      const { verifyMock, loadUserMock } = mockValidToken();
      const request = createRequest('Bearer good-token');
      const next = mock.fn();

      await requireAuthenticatedUser(request, {} as any, next);

      assert.equal(next.mock.callCount(), 1);
      assert.deepEqual(next.mock.calls[0].arguments, []);
      assert.equal(request.auth.user.userId, 'SV-1');
      assert.deepEqual(verifyMock.mock.calls[0].arguments, ['good-token']);
      assert.deepEqual(loadUserMock.mock.calls[0].arguments, ['SV-1']);
    });

    it('báo lỗi 401 qua next(error) khi thiếu header authorization và KHÔNG xác thực token', async () => {
      const { verifyMock } = mockValidToken();
      const next = mock.fn();

      await requireAuthenticatedUser(createRequest(), {} as any, next);

      const error = next.mock.calls[0].arguments[0] as any;
      assert.equal(error.statusCode, 401);
      assert.equal(error.message, JWT_INVALID);
      assert.equal(verifyMock.mock.callCount(), 0);
    });

    it('báo lỗi 401 khi header dùng sai scheme (Basic)', async () => {
      const next = mock.fn();

      await requireAuthenticatedUser(createRequest('Basic abc'), {} as any, next);

      const error = next.mock.calls[0].arguments[0] as any;
      assert.equal(error.statusCode, 401);
      assert.equal(error.message, JWT_INVALID);
    });

    it('giá trị biên: scheme phân biệt hoa thường, "bearer" viết thường bị từ chối 401', async () => {
      const next = mock.fn();

      await requireAuthenticatedUser(createRequest('bearer good-token'), {} as any, next);

      const error = next.mock.calls[0].arguments[0] as any;
      assert.equal(error.statusCode, 401);
      assert.equal(error.message, JWT_INVALID);
    });

    it('ném lỗi 401 khi token hết hạn và KHÔNG tải thông tin user', async () => {
      mock.method(AuthService, 'verifyAccessToken', () => {
        throw AppError.unauthorized(JWT_INVALID);
      });
      const loadUserMock = mock.method(AuthService, 'getAuthenticatedUser', async () => studentDto);
      const request = createRequest('Bearer expired');

      await assert.rejects(
        requireAuthenticatedUser(request, {} as any, () => undefined),
        (err: unknown) => err instanceof AppError && err.statusCode === 401 && err.message === JWT_INVALID
      );
      assert.equal(loadUserMock.mock.callCount(), 0);
      assert.equal(request.auth, undefined);
    });

    it('ném lỗi 403 khi tài khoản bị khóa và KHÔNG gọi next()', async () => {
      mock.method(AuthService, 'verifyAccessToken', () => ({ userId: 'SV-1' }));
      mock.method(AuthService, 'getAuthenticatedUser', async () => {
        throw new AppError(LOCKED, 403);
      });
      const next = mock.fn();

      await assert.rejects(
        requireAuthenticatedUser(createRequest('Bearer good-token'), {} as any, next),
        (err: unknown) => err instanceof AppError && err.statusCode === 403 && err.message === LOCKED
      );
      assert.equal(next.mock.callCount(), 0);
    });
  });

  describe('attachOptionalUser', () => {
    it('khách không có header authorization vẫn được đi tiếp', async () => {
      const { verifyMock } = mockValidToken();
      const request = createRequest();
      const next = mock.fn();

      await attachOptionalUser(request, {} as any, next);

      assert.deepEqual(next.mock.calls[0].arguments, []);
      assert.equal(verifyMock.mock.callCount(), 0);
      assert.equal(request.auth, undefined);
    });

    it('giá trị biên: header không phải Bearer được coi là khách, không báo lỗi', async () => {
      const { verifyMock } = mockValidToken();
      const request = createRequest('Basic abc');
      const next = mock.fn();

      await attachOptionalUser(request, {} as any, next);

      assert.deepEqual(next.mock.calls[0].arguments, []);
      assert.equal(verifyMock.mock.callCount(), 0);
      assert.equal(request.auth, undefined);
    });

    it('gắn request.auth.user khi Bearer token hợp lệ', async () => {
      mockValidToken();
      const request = createRequest('Bearer good-token');
      const next = mock.fn();

      await attachOptionalUser(request, {} as any, next);

      assert.deepEqual(next.mock.calls[0].arguments, []);
      assert.equal(request.auth.user.userId, 'SV-1');
    });

    it('ném lỗi 401 khi token hết hạn (không hạ xuống khách để client làm mới token)', async () => {
      mock.method(AuthService, 'verifyAccessToken', () => {
        throw AppError.unauthorized(JWT_INVALID);
      });

      await assert.rejects(
        attachOptionalUser(createRequest('Bearer expired'), {} as any, () => undefined),
        (err: unknown) => err instanceof AppError && err.statusCode === 401
      );
    });
  });

  describe('requireRoles', () => {
    it('cho đi tiếp khi role của user nằm trong danh sách cho phép', () => {
      const next = mock.fn();

      requireRoles(2)({ auth: { user: { role: 2 } } } as any, {} as any, next);

      assert.deepEqual(next.mock.calls[0].arguments, []);
    });

    it('báo lỗi 403 khi học sinh truy cập chức năng của giảng viên', () => {
      const next = mock.fn();

      requireRoles(2)({ auth: { user: studentDto } } as any, {} as any, next);

      const error = next.mock.calls[0].arguments[0] as any;
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, FORBIDDEN);
    });

    it('giá trị biên: báo lỗi 401 khi request chưa có thông tin đăng nhập', () => {
      const next = mock.fn();

      requireRoles(2)({} as any, {} as any, next);

      const error = next.mock.calls[0].arguments[0] as any;
      assert.equal(error.statusCode, 401);
      assert.equal(error.message, JWT_INVALID);
    });

    it('cho đi tiếp khi cho phép nhiều role và user là giảng viên', () => {
      const next = mock.fn();

      requireRoles(1, 2)({ auth: { user: { role: 2 } } } as any, {} as any, next);

      assert.deepEqual(next.mock.calls[0].arguments, []);
    });

    it('báo lỗi 403 khi admin truy cập chức năng chỉ dành cho học sinh và giảng viên', () => {
      const next = mock.fn();

      requireRoles(1, 2)({ auth: { user: { role: 3 } } } as any, {} as any, next);

      const error = next.mock.calls[0].arguments[0] as any;
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, FORBIDDEN);
    });

    it('giá trị biên: báo lỗi 403 khi role không xác định (role = 0)', () => {
      const next = mock.fn();

      requireRoles(3)({ auth: { user: { role: 0 } } } as any, {} as any, next);

      const error = next.mock.calls[0].arguments[0] as any;
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, FORBIDDEN);
    });
  });
});
