import MessageConstant from '../../../constants/MessageConstant.ts';

const format = MessageConstant.format;

// M04 weekly challenges (UC-18).
export default class ChallengeConstant {
  static readonly limits = Object.freeze({
    TITLE_MAX: 100,
    DESCRIPTION_MAX: 2000,
    BPM_MIN: 30,
    BPM_MAX: 240,
    ACCURACY_MIN: 0,
    ACCURACY_MAX: 100,
    MAX_SUBMISSIONS_DEFAULT: 3
  });

  // Upper bound of attempts per student; the brief fixes only the default.
  static readonly maxSubmissionsCap = 10;

  static readonly fieldLabels = Object.freeze({
    title: 'Tiêu đề',
    description: 'Mô tả',
    instrumentId: 'Nhạc cụ',
    pieceId: 'Bài nhạc',
    classIds: 'Lớp',
    weekStart: 'Tuần',
    requiredBpm: 'BPM yêu cầu',
    minAccuracy: 'Độ chính xác tối thiểu',
    maxSubmissions: 'Số lần nộp tối đa'
  });

  static readonly messages = Object.freeze({
    CREATED: format('MSG-01', { action: 'Tạo', object: 'thử thách' }),
    PUBLISHED: format('MSG-01', { action: 'Đăng', object: 'thử thách' }),
    UPDATED: format('MSG-01', { action: 'Cập nhật', object: 'thử thách' }),
    DELETED: format('MSG-01', { action: 'Xóa', object: 'thử thách' }),
    CHALLENGE_NOT_FOUND: 'Không tìm thấy thử thách.',
    PIECE_UNAVAILABLE: format('MSG-48', { resource: 'Bài nhạc' }),
    PIECE_NOT_READY: format('MSG-08', { action: 'đăng thử thách', reason: 'bài nhạc chưa có bản thu mẫu hoặc chưa phân tích xong' }),
    WEEK_NOT_MONDAY: format('MSG-08', { action: 'đăng thử thách', reason: 'tuần phải bắt đầu vào thứ Hai' }),
    WEEK_IN_PAST: format('MSG-08', { action: 'đăng thử thách', reason: 'không thể chọn tuần đã kết thúc' }),
    CLASS_OVERLAP: format('MSG-08', { action: 'đăng thử thách', reason: 'lớp đã có thử thách khác trong tuần này' }),
    CLASS_EMPTY: format('MSG-08', { action: 'đăng thử thách', reason: 'lớp chưa có sinh viên' }),
    CLASS_INSTRUMENT_MISMATCH: 'Lớp đã chọn không học nhạc cụ của thử thách.',
    NOT_DRAFT: (action: string): string => format('MSG-08', { action, reason: 'thử thách đã được đăng' }),
    PUBLISH_FAILED: format('MSG-09', { action: 'Đăng thử thách' }),
    SAVE_DRAFT_FAILED: format('MSG-09', { action: 'Lưu nháp thử thách' }),
    required: (field: string): string => format('MSG-35', { field }),
    tooLong: (field: string, max: number): string => format('MSG-37', { field, max }),
    outOfRange: (field: string, min: number, max: number): string => format('MSG-03', { field, min, max })
  });

  static readonly auditActions = Object.freeze({ CHALLENGE_PUBLISH: 'CHALLENGE_PUBLISH' });

  static readonly auditEntityType = 'challenge';

  static readonly notifications = Object.freeze({
    PUBLISHED_TITLE: 'Thử thách mới',
    body: (className: string, title: string): string => `${className} · ${title}`,
    link: (challengeId: string): string => `/community/challenges/${challengeId}`
  });
}
