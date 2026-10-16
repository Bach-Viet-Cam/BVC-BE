import MessageConstant from '../../../constants/MessageConstant.ts';

const format = MessageConstant.format;

// UC-11 Manage 6-Week Learning Roadmap (FR-M03.02.01).
export default class RoadmapConstant {
  static readonly limits = Object.freeze({
    WEEK_COUNT: 6,
    TITLE_MAX: 100,
    CONTENT_MAX: 1000,
    EXERCISES_PER_WEEK_MAX: 50,
    SEARCH_MAX: 100
  });

  // Standard framework used to initialise an instrument that has no roadmap yet (spec §4.3).
  static readonly standardFrameworkTitles: readonly string[] = Object.freeze([
    'Làm quen nhạc cụ & kỹ thuật cơ bản',
    'Bài tập kỹ thuật & Bài 1',
    'Bài 1, kiểm tra cá nhân & trình bày nhóm',
    'Hoàn thiện kỹ thuật & chuẩn bị hòa tấu',
    'Ghép nhóm hòa tấu',
    'Biểu diễn cuối khóa (Final Performance)'
  ]);

  static readonly messages = Object.freeze({
    ROADMAP_SAVED: 'Lưu lộ trình thành công.',
    EXERCISE_UNAVAILABLE: format('MSG-48', { resource: 'Bài luyện ngón' }),
    DUPLICATE_EXERCISE: 'Bài luyện ngón bị chọn trùng trong tuần.',
    WRONG_WEEK_COUNT: 'Lộ trình phải có đủ 6 tuần.',
    TOO_MANY_EXERCISES: 'Mỗi tuần tối đa 50 bài luyện ngón.',
    VERSION_CONFLICT: 'Không thể lưu lộ trình vì vừa có phiên bản mới. Vui lòng tải lại.',
    INSTRUMENT_NOT_FOUND: 'Không tìm thấy nhạc cụ.',
    INVALID_DATA: 'Kiểm tra lại dữ liệu gửi đi',
    weekTitleRequired: (weekNumber: number): string => format('MSG-35', { field: `Tiêu đề tuần ${weekNumber}` }),
    weekContentRequired: (weekNumber: number): string => format('MSG-35', { field: `Nội dung học tập tuần ${weekNumber}` }),
    weekTitleTooLong: (weekNumber: number): string =>
      format('MSG-37', { field: `Tiêu đề tuần ${weekNumber}`, max: RoadmapConstant.limits.TITLE_MAX }),
    weekContentTooLong: (weekNumber: number): string =>
      format('MSG-37', { field: `Nội dung học tập tuần ${weekNumber}`, max: RoadmapConstant.limits.CONTENT_MAX })
  });
}
