export default class PlatformConstant {
  static readonly defaultPageSize = 20;
  static readonly maxPageSize = 100;
  static readonly userStatuses = ['PENDING', 'ACTIVE', 'LOCKED'] as const;
  static readonly messages = Object.freeze({
    USER_NOT_FOUND: 'Không tìm thấy người dùng.',
    EMAIL_EXISTS: 'Email đã tồn tại.',
    STUDENT_CODE_EXISTS: 'Mã sinh viên đã tồn tại.',
    CANNOT_LOCK_SELF: 'Bạn không thể tự khóa tài khoản của mình.',
    CANNOT_CHANGE_OWN_ROLE: 'Bạn không thể thay đổi vai trò của chính mình.',
    TEACHER_HAS_ACTIVE_CLASSES: 'Không thể đổi vai trò của giảng viên đang phụ trách lớp học.',
    EMAIL_LOCKED: 'Không thể đổi email sau khi tài khoản đã đăng nhập.',
    USER_CREATED: 'Tạo người dùng thành công.',
    USER_UPDATED: 'Cập nhật người dùng thành công.',
    USER_LOCKED: 'Đã khóa tài khoản.',
    USER_UNLOCKED: 'Đã mở khóa tài khoản.'
  });
}
