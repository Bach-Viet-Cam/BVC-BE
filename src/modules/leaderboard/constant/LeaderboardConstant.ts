// UC-17 leaderboard (FR-M04.05.01, FR-M04.05.02). Decisions D4, D6, D10, D14, D17 of the plan.
export default class LeaderboardConstant {
  static readonly categories = ['overall', 'accuracy', 'improvement', 'streak', 'activity'] as const;
  static readonly categoryEnum = Object.freeze({
    overall: 'OVERALL',
    accuracy: 'ACCURACY',
    improvement: 'IMPROVEMENT',
    streak: 'STREAK',
    activity: 'ACTIVITY'
  } as const);

  // D4: criteria averaged into the overall score; drop one from the list to disable it.
  static readonly overallCriteria: readonly Backend.LeaderboardCriterion[] = Object.freeze(['streak', 'accuracy', 'bonus', 'completion']);

  // D6: a practice day has at least this many activities.
  static readonly streakMinActivitiesPerDay = 1;

  // D10: daily refresh at 08:00 Asia/Ho_Chi_Minh, checked every 5 minutes.
  static readonly refresh = Object.freeze({ hour: 8, intervalMs: 300_000 });

  static readonly paging = Object.freeze({ DEFAULT_LIMIT: 50, MAX_LIMIT: 100, TOP_COUNT: 3 });

  // D1: FA/SP/SU prefixes shown as Thu/Xuân/Hè.
  static readonly seasonLabels = Object.freeze({ FA: 'Thu', SP: 'Xuân', SU: 'Hè' } as const);

  static readonly messages = Object.freeze({
    CATEGORY_INVALID: 'Hạng mục không hợp lệ.',
    SEMESTER_INVALID: 'Học kỳ không hợp lệ.',
    REFRESHED: 'Đã làm mới bảng xếp hạng.'
  });
}
