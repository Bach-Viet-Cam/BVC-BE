import AuthConstant from '../../auth/constant/AuthConstant.ts';

export default class MusicLibraryConstant {
  static readonly roles = Object.freeze({
    LECTURER: AuthConstant.roles.TEACHER,
    STUDENT: AuthConstant.roles.STUDENT
  });

  static readonly pageSizes = Object.freeze({ LECTURER_PIECES: 20, LIBRARY_PIECES: 12, SAVED_ITEMS: 20, MAX: 100 });

  static readonly fieldLimits = Object.freeze({
    SEARCH: 100,
    PIECE_TITLE: 200,
    PIECE_COMPOSER: 200,
    PIECE_DESCRIPTION: 1000,
    SHEET_NAME: 100,
    SHEET_DESCRIPTION: 500
  });

  static readonly fieldLabels = Object.freeze({
    title: 'Tiêu đề',
    composer: 'Tên tác giả',
    description: 'Mô tả',
    genreId: 'Thể loại',
    levelId: 'Trình độ',
    instrumentId: 'Nhạc cụ',
    name: 'Tên bản',
    sheetFileId: 'File bản nhạc',
    fileName: 'Tên file',
    fileId: 'File'
  });

  static readonly mediaRules = Object.freeze({
    COVER: { extensions: ['jpg', 'jpeg', 'png', 'webp'], formatLabel: 'JPG, PNG, WebP', configKey: 'upload.cover.max_mb', defaultMaxMb: 5 },
    SHEET: { extensions: ['pdf', 'png', 'jpg', 'jpeg'], formatLabel: 'PDF, PNG, JPG', configKey: 'upload.sheet.max_mb', defaultMaxMb: 10 },
    AUDIO: { extensions: ['mp3', 'wav', 'm4a'], formatLabel: 'MP3, WAV, M4A', configKey: 'upload.audio.max_mb', defaultMaxMb: 20 },
    VIDEO: { extensions: ['mp4'], formatLabel: 'MP4', configKey: 'upload.video.max_mb', defaultMaxMb: 200 }
  });

  // file-type detection result (by magic bytes) accepted for each media kind
  static readonly detectedExtensions = Object.freeze({
    COVER: ['jpg', 'png', 'webp'],
    SHEET: ['pdf', 'png', 'jpg'],
    AUDIO: ['mp3', 'wav', 'm4a', 'mp4'],
    VIDEO: ['mp4', 'm4v', 'mov']
  });

  static readonly audioDurationConfig = Object.freeze({
    MIN_KEY: 'upload.audio.min_duration_sec',
    MAX_KEY: 'upload.audio.max_duration_sec',
    DEFAULT_MIN_SEC: 1,
    DEFAULT_MAX_SEC: 600
  });

  // Presigned upload window; content PUT after it is rejected
  static readonly upload = Object.freeze({ WINDOW_SEC: 15 * 60, MAX_BYTES: 250 * 1024 * 1024 });

  static readonly sheetSlots = Object.freeze({ sheet: 'SHEET', audio: 'AUDIO', video: 'VIDEO' } as const);

  static readonly messages = Object.freeze({
    PIECE_NOT_FOUND: { action: 'tìm bài hát', reason: 'bài hát không tồn tại' },
    PIECE_NOT_PUBLIC: { action: 'mở bài hát', reason: 'bài hát không còn công khai' },
    SHEET_NOT_FOUND: { action: 'tìm bản nhạc', reason: 'bản nhạc không tồn tại' },
    SHEET_NOT_PUBLIC: { action: 'mở bản nhạc', reason: 'bản nhạc không còn công khai' },
    PIECE_ADMIN_HIDDEN: { action: 'thay đổi hiển thị', reason: 'admin đã ẩn bài này, bạn không tự bật lại được' },
    SHEET_ADMIN_HIDDEN: { action: 'thay đổi hiển thị', reason: 'admin đã ẩn bản nhạc này, bạn không tự bật lại được' },
    MAIN_NEEDS_AUDIO: { action: 'công khai bản nhạc', reason: 'bản chính cần bản thu mẫu trước khi công khai' },
    MAIN_ALREADY_EXISTS: { action: 'tạo bản chính', reason: 'nhạc cụ này đã có bản chính' },
    CATEGORY_INACTIVE: { action: 'lưu', reason: 'danh mục đã chọn không còn hoạt động' },
    FILE_NOT_UPLOADED: { action: 'gắn file', reason: 'file chưa được tải lên hoặc không thuộc về bạn' },
    FILE_ALREADY_USED: { action: 'gắn file', reason: 'file này đã được dùng ở nơi khác' },
    FILE_KIND_MISMATCH: { action: 'gắn file', reason: 'loại file không đúng với ô đã chọn' },
    FILE_UNREADABLE: { action: 'đọc file', reason: 'file bị lỗi hoặc không đúng định dạng' },
    UPLOAD_CLOSED: { action: 'tải file lên', reason: 'file đã được xác nhận hoặc phiên tải lên đã hết hạn' },
    UPLOAD_TOO_LARGE: { action: 'tải file lên', reason: 'file vượt quá dung lượng đã khai báo' }
  });

  static readonly successMessages = Object.freeze({
    PIECE_CREATED: { action: 'tạo', object: 'bài hát' },
    PIECE_UPDATED: { action: 'cập nhật', object: 'bài hát' },
    PIECE_SHOWN: { action: 'hiện', object: 'bài hát' },
    PIECE_HIDDEN: { action: 'ẩn', object: 'bài hát' },
    COVER_UPDATED: { action: 'cập nhật', object: 'ảnh bìa' },
    COVER_REMOVED: { action: 'gỡ', object: 'ảnh bìa' },
    SHEET_CREATED: { action: 'thêm', object: 'bản nhạc' },
    SHEET_UPDATED: { action: 'cập nhật', object: 'bản nhạc' },
    SHEET_SHOWN: { action: 'hiện', object: 'bản nhạc' },
    SHEET_HIDDEN: { action: 'ẩn', object: 'bản nhạc' },
    FILE_REPLACED: { action: 'cập nhật', object: 'file' },
    PIECE_SAVED: { action: 'lưu', object: 'bài hát' },
    PIECE_UNSAVED: { action: 'bỏ lưu', object: 'bài hát' },
    SHEET_SAVED: { action: 'lưu', object: 'bản nhạc' },
    SHEET_UNSAVED: { action: 'bỏ lưu', object: 'bản nhạc' }
  });

  static readonly notifications = Object.freeze({
    ANALYSIS_READY: 'Bản thu mẫu đã phân tích xong',
    ANALYSIS_ERROR: 'Phân tích bản thu mẫu thất bại',
    DISPATCH_FAILED: 'Không gửi được yêu cầu phân tích tới dịch vụ AI.'
  });
}
