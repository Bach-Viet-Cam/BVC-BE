import MessageConstant from '../../../constants/MessageConstant.ts';

const format = MessageConstant.format;

export default class PlatformConstant {
  // Grading thresholds behind "Đạt" and the progress statuses live in system_configs (SCORING group).
  static readonly settingKeys = Object.freeze({ MIN_ACCURACY: 'min_accuracy_default', AT_RISK_MARGIN: 'at_risk_margin', SEMESTERS: 'class.semesters' });
  // Semesters for class creation: a JSON array of { name, startDate, endDate } (yyyy-MM-dd), edited on the admin config page.
  static readonly semesterConfig = Object.freeze({
    group: 'PRACTICE_RULE' as const,
    valueType: 'JSON' as const,
    label: 'Danh sách học kỳ',
    description: 'Mỗi học kỳ gồm tên, ngày bắt đầu và ngày kết thúc, ví dụ [{"name":"FA26","startDate":"2026-09-07","endDate":"2026-12-27"}].',
    NAME_MAX: 50
  });
  static readonly gradingLimits = Object.freeze({ MIN: 0, MAX: 100 });
  static readonly gradingMessages = Object.freeze({
    GRADING_SAVED: format('MSG-01', { action: 'Lưu', object: 'cấu hình chấm điểm' }),
    MARGIN_ABOVE_MINIMUM: 'Biên có nguy cơ không được lớn hơn độ chính xác tối thiểu.',
    GRADING_SETTINGS_MISSING: 'Thiếu cấu hình chấm điểm.',
    minAccuracyRange: format('MSG-03', { field: 'Độ chính xác tối thiểu', min: 0, max: 100 }),
    atRiskMarginRange: format('MSG-03', { field: 'Biên có nguy cơ', min: 0, max: 100 })
  });
  static readonly atRiskMarginConfig = Object.freeze({
    group: 'SCORING' as const,
    valueType: 'NUMBER' as const,
    label: 'Biên có nguy cơ (%)',
    description: 'Số điểm phần trăm dưới độ chính xác tối thiểu mà học viên được xem là có nguy cơ.'
  });
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
    NOTIFICATION_DELETED: 'Đã xóa thông báo.',
    NOTIFICATIONS_ALL_READ: 'Đã đánh dấu tất cả thông báo là đã đọc.',
    IMPORT_NO_ACTIONABLE_ROWS: 'Không có dòng hợp lệ để import.',
    IMPORT_CONFLICT: 'Dữ liệu vừa thay đổi trong lúc import. Vui lòng kiểm tra lại bản xem trước.',
    IMPORT_DONE: 'Import hoàn tất.'
  });
  static readonly userImport = Object.freeze({
    maxRows: 1000,
    maxFieldLength: 255,
    maxEmailLength: 100,
    maxUsernameLength: 100,
    studentCodePattern: /^[A-Za-z0-9_-]{1,20}$/,
    transactionTimeoutMs: 30_000
  });
  static readonly userImportMessages = Object.freeze({
    EMAIL_REQUIRED: 'Thiếu email.',
    EMAIL_INVALID: 'Email không hợp lệ (tối đa 100 ký tự).',
    USERNAME_REQUIRED: 'Thiếu họ tên.',
    USERNAME_TOO_LONG: 'Họ tên tối đa 100 ký tự.',
    USERNAME_INVALID: 'Họ tên chứa ký tự không hợp lệ.',
    CODE_REQUIRED: 'Thiếu mã sinh viên.',
    CODE_INVALID: 'Mã sinh viên chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới, tối đa 20 ký tự.',
    EMAIL_PRIVILEGED: 'Email thuộc tài khoản giảng viên hoặc quản trị, không thể import.',
    CODE_TAKEN: 'Mã sinh viên đã được dùng bởi tài khoản khác.',
    EXISTS_SKIPPED: 'Tài khoản đã tồn tại, bỏ qua.',
    NO_CHANGES: 'Không có thay đổi so với dữ liệu hiện có.',
    UPDATE_USERNAME: 'Cập nhật họ tên.',
    UPDATE_CODE: 'Cập nhật mã sinh viên.',
    duplicateEmail: (rowNumber: number): string => `Trùng email với dòng ${rowNumber}.`,
    duplicateCode: (rowNumber: number): string => `Trùng mã sinh viên với dòng ${rowNumber}.`
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
