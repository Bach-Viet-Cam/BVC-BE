import DateTimeUtil from '../../../utils/DateTimeUtil.ts';

const DAYS_PER_WEEK = 7;

// Week k of a class runs from start + 7(k−1) to start + 7k − 1 (spec §4.4). Dates are yyyy-MM-dd
// calendar days, so plain string comparison orders them correctly.
export default class RoadmapWeekCalculator {
  static buildWeekWindow(classStartDate: string, weekNumber: number): { startDate: string; endDate: string } {
    const startDate = DateTimeUtil.addDays(classStartDate, DAYS_PER_WEEK * (weekNumber - 1));
    return { startDate, endDate: DateTimeUtil.addDays(startDate, DAYS_PER_WEEK - 1) };
  }

  static resolveStatus(window: { startDate: string; endDate: string }, today: string): Backend.RoadmapWeekStatus {
    if (today > window.endDate) return 'PAST';
    if (today < window.startDate) return 'UPCOMING';
    return 'CURRENT';
  }
}
