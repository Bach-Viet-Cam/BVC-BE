import MessageConstant from '../../../constants/MessageConstant.ts';

const format = MessageConstant.format;
const saved = (action: string, object: string = 'bài tập'): string => format('MSG-01', { action, object });

// M03 practice assignments (user decision 16/10: no grading, no deadline, whole class).
export default class AssignmentConstant {
  static readonly limits = Object.freeze({ TITLE_MAX: 200, DESCRIPTION_MAX: 1000, BPM_MIN: 1, BPM_MAX: 300, COMMENT_MAX: 2000, SEARCH_MAX: 100 });

  static readonly kinds = ['SOLO', 'ENSEMBLE', 'BONUS', 'OTHER'] as const;
  static readonly statuses = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;

  // User decision 22/10: a class has at most one solo and one ensemble assignment.
  static readonly singleKinds: readonly Backend.AssignmentKind[] = Object.freeze(['SOLO', 'ENSEMBLE']);
  static readonly kindLabels = Object.freeze({ SOLO: 'Độc tấu', ENSEMBLE: 'Hòa tấu', BONUS: 'Bonus', OTHER: 'Bài tập khác' } as const);

  // Student-facing assignments (uat) are typed; the lecturer's kind is mirrored onto the closest type.
  static readonly typeByKind = Object.freeze({ SOLO: 'PRACTICE', ENSEMBLE: 'RHYTHM', BONUS: 'BONUS', OTHER: 'SHEET' } as const);

  // GBR-13: rejected / failed submissions are not counted.
  static readonly uncountedSubmissionStatuses: readonly Backend.SubmissionStatus[] = Object.freeze(['REJECTED', 'FAILED']);

  static readonly fieldLabels = Object.freeze({
    classId: 'Lớp',
    title: 'Tiêu đề',
    description: 'Mô tả',
    kind: 'Loại bài',
    requiredBpm: 'BPM yêu cầu',
    content: 'Nhận xét',
    q: 'Từ khóa tìm kiếm'
  });

  static readonly messages = Object.freeze({
    CREATED: saved('Tạo'),
    UPDATED: saved('Cập nhật'),
    PUBLISHED: saved('Đăng'),
    CLOSED: saved('Đóng'),
    REOPENED: saved('Mở lại'),
    DELETED: saved('Xóa'),
    COMMENT_SENT: saved('Gửi', 'nhận xét'),
    COMMENT_UPDATED: saved('Cập nhật', 'nhận xét'),
    ASSIGNMENT_NOT_FOUND: 'Không tìm thấy bài tập.',
    SUBMISSION_NOT_FOUND: 'Không tìm thấy bài nộp.',
    STUDENT_NOT_FOUND: 'Không tìm thấy sinh viên.',
    SHEET_MUSIC_UNAVAILABLE: format('MSG-48', { resource: 'Bản nhạc' }),
    BPM_RANGE: format('MSG-03', { field: 'BPM yêu cầu', min: 1, max: 300 }),
    KIND_REQUIRED: format('MSG-35', { field: 'Loại bài' }),
    KIND_TAKEN: (kind: Backend.AssignmentKind): string =>
      format('MSG-08', { action: 'lưu bài tập', reason: `lớp đã có bài ${AssignmentConstant.kindLabels[kind]}` }),
    INVALID_STATE: (action: string, reason: string): string => format('MSG-08', { action, reason }),
    COMMENT_LOCKED: format('MSG-08', { action: 'nhận xét', reason: 'lớp đã kết thúc hoặc sinh viên không còn trong lớp' }),
    CANNOT_SUBMIT: format('MSG-08', { action: 'nộp bài', reason: 'bài tập đã đóng hoặc không còn khả dụng' })
  });

  static readonly notifications = Object.freeze({
    PUBLISHED_TITLE: 'Bài tập mới',
    UPDATED_TITLE: 'Bài tập đã được cập nhật',
    REOPENED_TITLE: 'Bài tập đã được mở lại',
    COMMENTED_TITLE: 'Giảng viên đã nhận xét bài nộp',
    body: (className: string, title: string): string => `${className} · ${title}`,
    link: (assignmentId: string): string => `/assignment/${assignmentId}`
  });

  static readonly auditActions = Object.freeze({
    CREATE: 'ASSIGNMENT_CREATE',
    UPDATE: 'ASSIGNMENT_UPDATE',
    PUBLISH: 'ASSIGNMENT_PUBLISH',
    CLOSE: 'ASSIGNMENT_CLOSE',
    REOPEN: 'ASSIGNMENT_REOPEN',
    DELETE: 'ASSIGNMENT_DELETE'
  });

  static readonly auditEntityType = 'assignment';
}
