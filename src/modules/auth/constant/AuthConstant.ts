export default class AuthConstant {
  static readonly providers = Object.freeze({ GOOGLE: 'google' });
  static readonly roles = Object.freeze({ STUDENT: 1, TEACHER: 2, SYSTEM_ADMIN: 3 });
  static readonly selfRegisterableRoles = new Set<Number>([AuthConstant.roles.STUDENT, AuthConstant.roles.TEACHER]);
  static readonly messages = Object.freeze({
    GOOGLE_TOKEN_REQUIRED: 'Vui lòng cung cấp mã xác thực Google.',
    GOOGLE_TOKEN_INVALID: 'Mã xác thực Google không hợp lệ hoặc đã hết hạn.',
    JWT_INVALID: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    REFRESH_TOKEN_INVALID: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    GOOGLE_LOGIN_SUCCESS: 'Đăng nhập bằng Google thành công.',
    LOGOUT_SUCCESS: 'Đăng xuất thành công.'
  });
  static readonly refreshTokenCookieName = 'refreshToken';
}
