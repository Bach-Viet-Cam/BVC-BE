import MessageConstant from '../../../constants/MessageConstant.ts';

const format = MessageConstant.format;

export default class ClassConstant {
  static readonly limits = Object.freeze({
    NAME_MAX: 100,
    COHORT_MAX: 50,
    DESCRIPTION_MAX: 500,
    SEARCH_MAX: 100,
    STUDENT_CODE_MAX: 50,
    FULL_NAME_MAX: 100,
    EMAIL_MAX: 255,
    PAGE_SIZE_DEFAULT: 20,
    PAGE_SIZE_MAX: 200
  });

  static readonly importFile = Object.freeze({
    MAX_BYTES: 2 * 1024 * 1024,
    MAX_SIZE_MB: 2,
    MAX_DATA_ROWS: 200,
    ALLOWED_EXTENSIONS: ['xlsx', 'csv'] as const,
    FORM_FIELD: 'file',
    TEMPLATE_FILE_NAME: 'mau-danh-sach-sinh-vien.xlsx',
    TEMPLATE_SHEET_NAME: 'Danh sách SV',
    TEMPLATE_HEADERS: ['Mã sinh viên', 'Họ tên', 'Email']
  });

  // Accepted header spellings, compared after lower-casing and stripping diacritics and non-alphanumerics.
  static readonly importHeaderAliases: Readonly<Record<Backend.StudentRowField, readonly string[]>> = Object.freeze({
    studentCode: ['studentcode', 'masinhvien', 'masv', 'mssv'],
    fullName: ['fullname', 'hoten', 'hovaten'],
    email: ['email', 'mail']
  });

  static readonly fieldLabels: Readonly<Record<string, string>> = Object.freeze({
    name: 'Mã lớp',
    cohort: 'Học kỳ',
    instrumentId: 'Môn học',
    description: 'Mô tả',
    startDate: 'Ngày bắt đầu',
    studentCode: 'Mã sinh viên',
    fullName: 'Họ tên',
    email: 'Email',
    q: 'Từ khóa tìm kiếm',
    file: 'File'
  });

  static readonly rowReasons = Object.freeze({
    missing: (label: string): string => `Thiếu ${label.toLowerCase()}`,
    tooLong: (label: string, max: number): string => `${label} quá dài (tối đa ${max} ký tự)`,
    INVALID_EMAIL: 'Email không hợp lệ',
    duplicateInFile: (rowNumber: number): string => `Trùng dòng ${rowNumber} trong file`,
    ALREADY_IN_CLASS: 'Đã có trong lớp',
    CODE_BELONGS_TO_OTHER_EMAIL: 'Mã sinh viên đã thuộc tài khoản có email khác',
    EMAIL_HAS_OTHER_CODE: 'Email đã gắn với mã sinh viên khác',
    EMAIL_NOT_STUDENT: 'Email thuộc tài khoản không phải sinh viên'
  });

  static readonly messages = Object.freeze({
    CLASS_NOT_FOUND: 'Không tìm thấy lớp học.',
    MEMBER_NOT_FOUND: 'Không tìm thấy sinh viên trong lớp.',
    IMPORT_LOG_NOT_FOUND: 'Không tìm thấy phiên nhập danh sách.',
    CLASS_FINISHED: format('MSG-08', { action: 'thay đổi lớp', reason: 'lớp đã kết thúc' }),
    INSTRUMENT_LOCKED: format('MSG-08', { action: 'đổi môn học', reason: 'lớp đã bắt đầu' }),
    SEMESTER_LOCKED: format('MSG-08', { action: 'đổi học kỳ', reason: 'lớp đã bắt đầu' }),
    SEMESTER_NOT_FOUND: 'Học kỳ đã chọn không tồn tại. Vui lòng chọn học kỳ khác.',
    INSTRUMENT_UNAVAILABLE: 'Môn học đã chọn không còn hoạt động. Vui lòng chọn môn học khác.',
    DUPLICATE_CLASS_NAME: 'Mã lớp đã tồn tại.',
    UNSUPPORTED_FILE: format('MSG-13', { allowed_formats: '.xlsx, .csv' }),
    FILE_TOO_LARGE: format('MSG-14', { max_size: 2 }),
    FILE_REQUIRED: format('MSG-35', { field: 'File' }),
    FILE_UNREADABLE: format('MSG-08', { action: 'đọc file', reason: 'file bị lỗi hoặc không đúng định dạng' }),
    FILE_MISSING_COLUMNS: (columns: string): string => format('MSG-08', { action: 'nhập danh sách', reason: `file thiếu cột bắt buộc: ${columns}` }),
    FILE_TOO_MANY_ROWS: format('MSG-08', { action: 'nhập danh sách', reason: 'file có quá 200 dòng dữ liệu' }),
    FILE_NO_DATA: format('MSG-08', { action: 'nhập danh sách', reason: 'file không có dòng dữ liệu nào' }),
    IMPORT_NO_VALID_ROWS: format('MSG-08', { action: 'nhập danh sách', reason: 'không có dòng hợp lệ' }),
    IMPORT_ALREADY_PROCESSED: format('MSG-08', { action: 'xác nhận nhập', reason: 'phiên nhập này đã được xử lý' }),
    IMPORT_DATA_CHANGED: format('MSG-08', { action: 'xác nhận nhập', reason: 'dữ liệu sinh viên vừa thay đổi. Vui lòng tải lại file' }),
    CLASS_CREATED: format('MSG-01', { action: 'Tạo', object: 'lớp' }),
    CLASS_UPDATED: format('MSG-01', { action: 'Cập nhật', object: 'lớp' }),
    CLASS_ENDED: format('MSG-01', { action: 'Kết thúc', object: 'lớp' }),
    MEMBER_ADDED: format('MSG-01', { action: 'Thêm', object: 'sinh viên' }),
    MEMBER_REMOVED: format('MSG-01', { action: 'Xóa', object: 'sinh viên' }),
    IMPORT_CANCELLED: 'Đã hủy nhập danh sách.',
    importSummary: (importedCount: number, skippedCount: number): string =>
      format('MSG-45', { hợp_lệ: importedCount, bỏ_qua: skippedCount })
  });

  static readonly auditActions = Object.freeze({
    CLASS_CREATE: 'CLASS_CREATE',
    CLASS_UPDATE: 'CLASS_UPDATE',
    CLASS_END: 'CLASS_END',
    MEMBER_ADD: 'CLASS_MEMBER_ADD',
    MEMBER_REMOVE: 'CLASS_MEMBER_REMOVE',
    IMPORT_CONFIRM: 'CLASS_IMPORT_CONFIRM'
  });

  static readonly auditEntityTypes = Object.freeze({ CLASS: 'class', CLASS_MEMBER: 'class_member', IMPORT_LOG: 'student_import_log' });

  static readonly emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
}
