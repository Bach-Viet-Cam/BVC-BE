export default class PlatformConstant {
  static readonly defaultPageSize = 20;
  static readonly maxPageSize = 100;
  static readonly userStatuses = ['PENDING', 'ACTIVE', 'LOCKED'] as const;
  static readonly stats = Object.freeze({
    overviewDays: 14,
    monitoringDays: 7,
    activeUserDays: 7,
    queueLimit: 10,
    failureLimit: 10,
    recentUserLimit: 5,
    utcOffsetMinutes: 420,
    storageWarnPercent: 80,
    queueWarnCount: 5,
    capacityConfigKey: 'storage_capacity_gb',
    defaultCapacityGb: 10,
    overviewConfigKeys: ['max_recording_mb', 'max_recording_sec', 'min_accuracy_default', 'default_max_submissions']
  });
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
    USER_UNLOCKED: 'Đã mở khóa tài khoản.',
    INSTRUMENT_NOT_FOUND: 'Không tìm thấy nhạc cụ.',
    INSTRUMENT_CODE_EXISTS: 'Mã nhạc cụ đã tồn tại.',
    INSTRUMENT_CREATED: 'Thêm nhạc cụ thành công.',
    INSTRUMENT_UPDATED: 'Cập nhật nhạc cụ thành công.',
    INSTRUMENT_DEACTIVATED: 'Đã ngừng hoạt động nhạc cụ.',
    INSTRUMENT_ACTIVATED: 'Đã bật lại nhạc cụ.',
    CONFIG_NOT_FOUND: 'Không tìm thấy tham số hệ thống.',
    CONFIG_UPDATED: 'Cập nhật tham số thành công.',
    CATEGORY_NOT_FOUND: 'Không tìm thấy danh mục.',
    CATEGORY_NAME_EXISTS: 'Tên danh mục đã tồn tại trong cùng cấp.',
    CATEGORY_PARENT_INVALID: 'Danh mục cha không hợp lệ: chỉ cho phép tối đa 2 cấp.',
    CATEGORY_HAS_CHILDREN: 'Không thể xóa danh mục còn danh mục con.',
    CATEGORY_HAS_PIECES: 'Không thể xóa danh mục còn bài nhạc. Hãy chuyển bài nhạc sang danh mục khác trước.',
    CATEGORY_CREATED: 'Thêm danh mục thành công.',
    CATEGORY_UPDATED: 'Cập nhật danh mục thành công.',
    CATEGORY_DELETED: 'Đã xóa danh mục.',
    NOTIFICATION_NOT_FOUND: 'Không tìm thấy thông báo.',
    NOTIFICATION_LOCKED: 'Thông báo đã gửi, không thể sửa hoặc xóa.',
    NOTIFICATION_ALREADY_SENT: 'Thông báo này đã được gửi.',
    NOTIFICATION_SCHEDULE_PAST: 'Thời điểm hẹn giờ phải ở tương lai.',
    NOTIFICATION_DELETED: 'Đã xóa thông báo.'
  });
  static readonly notificationStatusMessages: Record<Backend.NotificationStatusName, string> = {
    DRAFT: 'Đã lưu nháp thông báo.',
    SCHEDULED: 'Đã hẹn giờ gửi thông báo.',
    SENT: 'Đã gửi thông báo.'
  };
  static readonly notification = Object.freeze({
    dispatchIntervalMs: 30_000,
    dueBatchSize: 50,
    maxPageSize: 100
  });
}
