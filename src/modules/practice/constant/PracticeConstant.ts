// M01 practice submissions processed by the Rhythm service (UC-01 steps 11-14).
export default class PracticeConstant {
  static readonly stageByJob = Object.freeze({
    quality_check: 'QUALITY_CHECK',
    audio_analysis: 'AUDIO_ANALYSIS',
    comparison: 'COMPARISON',
    feedback: 'FEEDBACK'
  } as const satisfies Record<Audio.JobCode, Practice.Stage>);

  static readonly jobByStage = Object.freeze({
    QUALITY_CHECK: 'quality_check',
    AUDIO_ANALYSIS: 'audio_analysis',
    COMPARISON: 'comparison',
    FEEDBACK: 'feedback'
  } as const satisfies Record<Practice.Stage, Audio.JobCode>);

  // GBR-63: the jobs always run in this order
  static readonly stageOrder: readonly Practice.Stage[] = Object.freeze(['QUALITY_CHECK', 'AUDIO_ANALYSIS', 'COMPARISON', 'FEEDBACK']);

  // GBR-65: a job running longer than one minute fails; the grace covers callback latency
  static readonly jobTimeoutMs = 60_000;
  static readonly staleGraceMs = 10_000;

  // GBR-59: three retries, the first available after 5 s and the later ones after 10 s
  static readonly maxRetries = 3;
  static readonly retryDelaysMs = Object.freeze({ FIRST: 5_000, LATER: 10_000 });

  // The template URL must stay readable for the whole retry window
  static readonly callbackPath = '/api/v1/internal/practice-submissions/progress';
  static readonly lockNamespace = 'practice-submission';

  // SCR-01 history list paging and the accuracy bounds of its filters
  static readonly historyPageSize = Object.freeze({ DEFAULT: 20, MAX: 50 });
  static readonly accuracyBounds = Object.freeze({ MIN: 0, MAX: 100 });
  static readonly historyTitleMax = 200;
  // History dates are Vietnam calendar days
  static readonly vietnamOffset = '+07:00';

  // M01 results screen
  static readonly resultHistoryLimit = 10;
  // GBR-53: the class rank card needs enough classmates to stay anonymous
  static readonly minClassPeers = 3;
  static readonly scoreBucketSize = 10;
  // Tempo score loses this many points per percent of tempo deviation
  static readonly tempoScorePenaltyPerPercent = 2;
  static readonly pitchChart = Object.freeze({ MAX_POINTS: 600, TIME_MAP_POINTS: 100, MIN_VOICED_RATIO: 0.5 });
  // Rhythm returns this text when Gemini is unavailable (app/feedback/gemini_feedback.py FALLBACK_FEEDBACK)
  static readonly fallbackFeedback = 'Chưa thể tạo nhận xét AI lúc này. Bạn vẫn có thể xem các chỉ số phân tích để tiếp tục luyện tập.';
  static readonly issueLabels = Object.freeze({
    fast: 'Nhanh hơn bản mẫu',
    slow: 'Chậm hơn bản mẫu',
    missing: 'Thiếu nốt'
  } as const satisfies Record<Practice.RhythmIssueStatus, string>);

  static readonly errorCodes = Object.freeze({
    PUBLISH_FAILED: 'PUBLISH_FAILED',
    JOB_TIMEOUT: 'JOB_TIMEOUT',
    RETRY_DISPATCH_FAILED: 'RETRY_DISPATCH_FAILED',
    QUALITY_REJECTED: 'QUALITY_REJECTED',
    EVALUATION_FAILED: 'EVALUATION_FAILED'
  });

  static readonly messages = Object.freeze({
    SENT: 'Đã gửi bản thu. Hệ thống đang xử lý.', // MSG-18
    RETRYING: 'Đang xử lý lại bản thu...', // MSG-24
    BUSY: 'Bản nộp trước đang được xử lý. Vui lòng đợi hoàn tất rồi nộp bản mới.', // GBR-49
    SUBMISSION_NOT_FOUND: 'Không tìm thấy bản nộp.',
    UPLOAD_INVALID: 'File ghi âm không hợp lệ hoặc bạn không có quyền sử dụng file.',
    NOT_PRACTICABLE_HINT: 'Hãy luyện bản chính của nhạc cụ này.',
    SHEET_PREPARING: 'Bản nhạc đang được chuẩn bị, vui lòng quay lại sau.',
    SHEET_NOT_FOUND: 'Không tìm thấy bản nhạc đã chọn của bài này.',
    NO_REFERENCE_AUDIO: 'Bản nhạc này chưa có bản thu mẫu nên chưa thể phân tích.',
    RETRY_NOT_ALLOWED: 'Bản nộp này không thể xử lý lại.',
    RETRY_TOO_EARLY: 'Bạn có thể thử lại sau ít giây nữa.',
    PUBLISH_FAILED: 'Không thể gửi bản thu vào hàng đợi xử lý.',
    JOB_TIMEOUT: 'Bước xử lý chạy quá thời gian cho phép.',
    RETRY_DISPATCH_FAILED: 'Chưa thể gửi yêu cầu xử lý lại.',
    QUALITY_REJECTED: 'Bản thu không đạt chất lượng.',
    PROCESSING_FAILED: 'Xử lý bản thu thất bại.',
    DATE_RANGE_INVALID: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
    ACCURACY_RANGE_INVALID: 'Accuracy "Từ" phải nhỏ hơn hoặc bằng accuracy "Đến".',
    RESULT_PROCESSING: 'Bản thu đang được xử lý. Kết quả sẽ hiển thị khi phân tích hoàn tất.', // MSG-30
    PITCH_UNAVAILABLE: 'Chưa có dữ liệu cao độ để hiển thị biểu đồ so sánh.' // MSG-26
  });
}
