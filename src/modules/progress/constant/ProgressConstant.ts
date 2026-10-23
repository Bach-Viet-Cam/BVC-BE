import MessageConstant from '../../../constants/MessageConstant.ts';

// FR-M03.02.03 student progress (sub-project 4, user decisions P1–P7 on 16/10).
export default class ProgressConstant {
  static readonly limits = Object.freeze({ WEEK_COUNT: 6, DAYS_PER_WEEK: 7, PAGE_SIZE_DEFAULT: 50, PAGE_SIZE_MAX: 200, RECENT_DAYS: 7 });

  static readonly messages = Object.freeze({
    FROM_AFTER_TO: MessageConstant.format('MSG-04', { from_field: 'Từ ngày', to_field: 'đến ngày' }),
    STUDENT_NOT_FOUND: 'Không tìm thấy sinh viên.',
    INVALID_DATE: 'Ngày không hợp lệ.'
  });
}
