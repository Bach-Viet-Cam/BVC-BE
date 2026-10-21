export default class AuthConstant {
  static readonly providers = Object.freeze({ GOOGLE: 'google' });
  static readonly roles = Object.freeze({ STUDENT: 1, TEACHER: 2, SYSTEM_ADMIN: 3 });
  static readonly messages = Object.freeze({
    GOOGLE_TOKEN_REQUIRED: 'Vui lòng cung cấp mã xác thực Google.',
    GOOGLE_TOKEN_INVALID: 'Mã xác thực Google không hợp lệ hoặc đã hết hạn.',
    JWT_INVALID: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    REFRESH_TOKEN_INVALID: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    GOOGLE_LOGIN_SUCCESS: 'Đăng nhập bằng Google thành công.',
    ACCOUNT_NOT_PROVISIONED: 'Tài khoản chưa được cấp. Vui lòng liên hệ quản trị viên.',
    LOGOUT_SUCCESS: 'Đăng xuất thành công.',
    ACCOUNT_LOCKED: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
    FORBIDDEN_ROLE: 'Bạn không có quyền truy cập chức năng này.'
  });
  static readonly refreshTokenCookieName = 'refreshToken';
}
