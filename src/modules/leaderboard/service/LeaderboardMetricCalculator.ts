import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import AssignmentProgressCalculator from '../../assignments/service/AssignmentProgressCalculator.ts';
import ProgressCalculator from '../../progress/service/ProgressCalculator.ts';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const mean = (values: number[]): number | null => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);

// Pure per-student metrics of the leaderboard (decisions D3, D5-D8, D15, D16); every calendar day follows Asia/Ho_Chi_Minh.
export default class LeaderboardMetricCalculator {
  // D5: best completed accuracy per counted assignment, averaged (same figure as the progress screen)
  static accuracy(submissions: Backend.LeaderboardSubmission[]): number | null {
    const rows = submissions.filter((submission) => submission.isCounted);
    return ProgressCalculator.averageOfBest(rows);
  }

  // D8: mean completed accuracy of this ISO week minus last week's, in percentage points; null unless both weeks have data
  static weeklyImprovement(submissions: Backend.LeaderboardSubmission[], weekStart: string): number | null {
    const previousWeekStart = DateTimeUtil.addDays(weekStart, -7);
    const thisWeek: number[] = [];
    const previousWeek: number[] = [];
    for (const submission of submissions) {
      if (!submission.isCounted || submission.status !== 'COMPLETED' || submission.accuracy === null) continue;
      const day = DateTimeUtil.dayKeyInVietnam(submission.submittedAt);
      if (day >= weekStart && day < DateTimeUtil.addDays(weekStart, 7)) thisWeek.push(submission.accuracy);
      else if (day >= previousWeekStart && day < weekStart) previousWeek.push(submission.accuracy);
    }
    const thisAverage = mean(thisWeek);
    const previousAverage = mean(previousWeek);
    if (thisAverage === null || previousAverage === null) return null;
    return round2(thisAverage - previousAverage);
  }

  // D3: instants of every submission (any status) and every ensemble session except FAILED
  static activityInstants(activity: Backend.LeaderboardActivity): Date[] {
    return [
      ...activity.submissions.map((submission) => submission.submittedAt),
      ...activity.ensembleSessions.filter((session) => session.status !== 'FAILED').map((session) => session.createdAt)
    ];
  }

  // D6: ascending list of days with at least minPerDay activities
  static activityDays(activity: Backend.LeaderboardActivity, minPerDay: number): string[] {
    const countByDay = new Map<string, number>();
    for (const instant of LeaderboardMetricCalculator.activityInstants(activity)) {
      const day = DateTimeUtil.dayKeyInVietnam(instant);
      countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
    }
    return [...countByDay.entries()].filter(([, count]) => count >= minPerDay).map(([day]) => day).sort();
  }

  static longestStreak(days: string[]): number {
    let longest = 0;
    let run = 0;
    days.forEach((day, index) => {
      run = index > 0 && DateTimeUtil.diffDays(days[index - 1], day) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    });
    return longest;
  }

  // A streak that ended yesterday is still current; one that ended earlier is broken
  static currentStreak(days: string[], today: string): number {
    if (days.length === 0 || DateTimeUtil.diffDays(days[days.length - 1], today) > 1) return 0;
    let run = 1;
    for (let index = days.length - 1; index > 0 && DateTimeUtil.diffDays(days[index - 1], days[index]) === 1; index -= 1) run += 1;
    return run;
  }

  // D7: activities in the ISO week starting at weekStart
  static weeklyActivity(activity: Backend.LeaderboardActivity, weekStart: string): number {
    const weekEnd = DateTimeUtil.addDays(weekStart, 7);
    return LeaderboardMetricCalculator.activityInstants(activity).filter((instant) => {
      const day = DateTimeUtil.dayKeyInVietnam(instant);
      return day >= weekStart && day < weekEnd;
    }).length;
  }

  // D15: bonusPoints of the bonus assignments the student completed
  static confirmedBonus(submissions: Backend.LeaderboardSubmission[], bonusAssignments: Backend.LeaderboardBonusAssignment[]): number {
    const completedIds = new Set(submissions.filter((submission) => submission.status === 'COMPLETED').map((submission) => submission.assignmentId));
    return bonusAssignments.reduce((total, bonus) => (completedIds.has(bonus.id) ? total + (bonus.bonusPoints ?? 0) : total), 0);
  }

  // D16: percentage of counted assignments with status PASSED
  static completionRate(submissions: Backend.LeaderboardSubmission[], assignmentIds: string[], minAccuracy: number): number {
    if (assignmentIds.length === 0) return 0;
    const passedCount = assignmentIds.filter((assignmentId) => {
      const snapshots = submissions.filter((submission) => submission.assignmentId === assignmentId);
      return AssignmentProgressCalculator.summarize(snapshots, minAccuracy).status === 'PASSED';
    }).length;
    return round2((passedCount / assignmentIds.length) * 100);
  }

  // D3: at least one activity inside the semester window (inclusive calendar days)
  static hasActivity(activity: Backend.LeaderboardActivity, window: { from: string; to: string }): boolean {
    return LeaderboardMetricCalculator.activityInstants(activity).some((instant) => {
      const day = DateTimeUtil.dayKeyInVietnam(instant);
      return day >= window.from && day <= window.to;
    });
  }
}
