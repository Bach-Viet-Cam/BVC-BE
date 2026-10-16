export default class EnsembleConstant {
  static readonly recordingFieldName = 'recording';
  static readonly recordingDir = 'uploads/recordings';
  static readonly messages = Object.freeze({
    NO_TRACKS: 'Bài nhạc này chưa có track hòa tấu ảo nên chưa thể luyện cùng ensemble.',
    NOT_A_MEMBER: 'Bạn chưa thuộc lớp học nào nên chưa thể luyện hòa tấu.',
    PIECE_NOT_FOUND: 'Không tìm thấy bài nhạc.',
    ASSIGNMENT_NOT_FOUND: 'Không thể mở bài tập vì bài tập không còn khả dụng.',
    RECORDING_REQUIRED: 'Vui lòng cung cấp bản thu.',
    TRACK_SETTINGS_INVALID: 'Cấu hình bộ trộn âm không hợp lệ.',
    SESSION_NOT_FOUND: 'Không tìm thấy phiên luyện tập.',
    SESSION_SAVED: 'Đã lưu bản thu của bạn.',
    UPLOAD_FAILED: 'Không thể tải bản thu lên. Vui lòng thử lại.'
  });
}
