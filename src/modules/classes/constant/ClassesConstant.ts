export default class ClassesConstant {
  static readonly progressStatuses = ['ON_TRACK', 'AT_RISK', 'BEHIND'] as const;
  static readonly messages = Object.freeze({
    CLASS_NOT_FOUND: 'Không tìm thấy lớp học.',
    CLASS_FORBIDDEN: 'Bạn chỉ có thể xem dữ liệu của lớp mình phụ trách.',
    ASSIGNMENT_NOT_FOUND: 'Không thể mở bài tập vì bài tập không còn khả dụng.',
    SUBMIT_BLOCKED: 'Bạn đã hết lượt nộp hoặc bài đã quá hạn.'
  });
}
