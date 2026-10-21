// System message catalog (SRS MSG-*). Keep in sync with the FE copy of this file.
export default class MessageConstant {
  static readonly templates = Object.freeze({
    'MSG-01': '{action} {object} thành công.',
    'MSG-02': '{action} {object}? {consequence}',
    'MSG-03': '{field} phải nằm trong khoảng từ {min} đến {max}.',
    'MSG-04': '{from_field} không được sau {to_field}.',
    'MSG-05': '{field} này đã được sử dụng.',
    'MSG-06': '{subject} chưa có {item}.',
    'MSG-07': 'Không tìm thấy {item} phù hợp.',
    'MSG-08': 'Không thể {action} vì {reason}.',
    'MSG-09': '{action} thất bại. Vui lòng thử lại.',
    'MSG-13': 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng {allowed_formats}.',
    'MSG-14': 'File vượt quá dung lượng tối đa {max_size} MB.',
    'MSG-15': 'Thời lượng bản thu phải nằm trong khoảng từ {min} đến {max}.',
    'MSG-16': 'Bạn không thể nộp bài vì đã quá hạn hoặc đã dùng hết số lần nộp.',
    'MSG-35': '{field} không được để trống.',
    'MSG-37': '{field} không được vượt quá {max} ký tự.',
    'MSG-38': 'Bài nhạc này chưa có track hòa tấu ảo nên chưa thể luyện cùng ensemble.',
    'MSG-45': 'Đã nhập {hợp_lệ} sinh viên, bỏ qua {bỏ_qua} dòng không hợp lệ.',
    'MSG-46': 'Bài hát chưa có bản nhạc công khai nào; học sinh sẽ chưa thấy bản nhạc cho đến khi có bản công khai đầu tiên.',
    'MSG-47': 'Đăng nhập để {action}.',
    'MSG-48': '{resource} đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.'
  });

  static format(code: Backend.MessageCode, params: Record<string, string | number> = {}): string {
    const template: string = MessageConstant.templates[code];
    const message = template.replace(/\{([^}]+)\}/g, (placeholder, name: string) => (
      name in params ? String(params[name]) : placeholder
    ));
    // Templates start with a placeholder (e.g. "{action}") that is usually lowercase in params
    return message.charAt(0).toUpperCase() + message.slice(1);
  }
}
