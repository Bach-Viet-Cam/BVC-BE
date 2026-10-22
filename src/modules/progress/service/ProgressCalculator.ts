import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import RoadmapWeekCalculator from '../../roadmaps/service/RoadmapWeekCalculator.ts';
import ProgressConstant from '../constant/ProgressConstant.ts';

const limits = ProgressConstant.limits;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const mean = (values: number[]): number | null => (values.length === 0 ? null : round2(values.reduce((sum, value) => sum + value, 0) / values.length));

// Pure progress maths (GBR-02, GBR-24; spec §2): best completed submission per assignment, averaged,
// compared with the admin thresholds; weeks follow the class calendar in Asia/Ho_Chi_Minh.
export default class ProgressCalculator {
  static averageOfBest(rows: Backend.ProgressSubmissionRow[]): number | null {
    const bestByAssignment = new Map<string, number>();
    for (const row of rows) {
      if (row.status !== 'COMPLETED' || row.accuracy === null) continue;
      bestByAssignment.set(row.assignmentId, Math.max(bestByAssignment.get(row.assignmentId) ?? -Infinity, row.accuracy));
    }
    return mean([...bestByAssignment.values()]);
  }

  static resolveStatus(average: number | null, settings: { minAccuracy: number; atRiskMargin: number }): Backend.ProgressStatus | null {
    if (average === null) return null;
    if (average >= settings.minAccuracy) return 'ON_TRACK';
    if (average >= settings.minAccuracy - settings.atRiskMargin) return 'AT_RISK';
    return 'BEHIND';
  }

  // Week 1–6 of the class for a submission time (Vietnam calendar day); outside the 6 weeks → null.
  static weekOf(classStartDate: string, submittedAt: Date): number | null {
    const submittedDay = DateTimeUtil.toDateOnly(DateTimeUtil.todayInVietnam(submittedAt));
    const days = Math.round((submittedDay.getTime() - DateTimeUtil.toDateOnly(classStartDate).getTime()) / DateTimeUtil.dayInMilliseconds);
    if (days < 0 || days >= limits.WEEK_COUNT * limits.DAYS_PER_WEEK) return null;
    return Math.floor(days / limits.DAYS_PER_WEEK) + 1;
  }

  // P4: mean of every completed submission in the week (not only the best), null when the week has none.
  static weeklyAverages(classStartDate: string, rows: Array<{ status: Backend.SubmissionStatus; accuracy: number | null; submittedAt: Date }>): Backend.WeeklyAverage[] {
    const byWeek = new Map<number, number[]>();
    for (const row of rows) {
      if (row.status !== 'COMPLETED' || row.accuracy === null) continue;
      const week = ProgressCalculator.weekOf(classStartDate, row.submittedAt);
      if (week === null) continue;
      byWeek.set(week, [...(byWeek.get(week) ?? []), row.accuracy]);
    }
    return Array.from({ length: limits.WEEK_COUNT }, (_, index) => {
      const week = index + 1;
      return { week, ...RoadmapWeekCalculator.buildWeekWindow(classStartDate, week), average: mean(byWeek.get(week) ?? []) };
    });
  }
}
