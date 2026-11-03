import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';

interface ScoredRecord extends Practice.DashboardRecord { accuracy: number; }

// Student home dashboard: today's activity, the last days, assignment highlights and solo / ensemble progress
export default class StudentDashboardService {
  constructor(private readonly repository: PracticeSubmissionRepository = new PracticeSubmissionRepository()) {}

  async get(studentId: string, now: Date = new Date()): Promise<Practice.DashboardDTO> {
    const rows = await this.repository.findDashboardRows(studentId);
    const assignments = this.toAssignmentStats(rows);
    return {
      totalSubmissions: rows.length,
      today: this.toToday(rows, DateTimeUtil.todayInVietnam(now)),
      recentDays: this.toRecentDays(rows, now),
      mostSubmittedAssignment: this.pickMostSubmitted(assignments),
      mostImprovedAssignment: this.pickMostImproved(assignments),
      solo: this.toModeProgress(rows, 'SOLO'),
      ensemble: this.toModeProgress(rows, 'ENSEMBLE')
    };
  }

  static isScored(row: Practice.DashboardRecord): row is ScoredRecord {
    return row.status === 'COMPLETED' && row.accuracy !== null;
  }

  static round(value: number): number {
    return Math.round(value * 10) / 10;
  }

  static average(values: number[]): number | null {
    if (values.length === 0) return null;
    return StudentDashboardService.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  // Latest minus first; null until there are two values to compare
  static delta(values: number[]): number | null {
    if (values.length < 2) return null;
    return StudentDashboardService.round(values[values.length - 1] - values[0]);
  }

  private toToday(rows: Practice.DashboardRecord[], todayKey: string): Practice.DashboardTodayDTO {
    const todayRows = rows.filter((row) => DateTimeUtil.dayKeyInVietnam(row.createdAt) === todayKey);
    const accuracies = todayRows.filter(StudentDashboardService.isScored).map((row) => row.accuracy);
    return {
      submitted: todayRows.length,
      completed: accuracies.length,
      bestAccuracy: accuracies.length > 0 ? StudentDashboardService.round(Math.max(...accuracies)) : null,
      averageAccuracy: StudentDashboardService.average(accuracies)
    };
  }

  private toRecentDays(rows: Practice.DashboardRecord[], now: Date): Practice.DashboardDayDTO[] {
    const todayKey = DateTimeUtil.todayInVietnam(now);
    const dayCount = PracticeConstant.dashboard.RECENT_DAYS;
    return Array.from({ length: dayCount }, (_, index) => {
      const date = DateTimeUtil.addDays(todayKey, index - (dayCount - 1));
      const dayRows = rows.filter((row) => DateTimeUtil.dayKeyInVietnam(row.createdAt) === date);
      const accuracies = dayRows.filter(StudentDashboardService.isScored).map((row) => row.accuracy);
      return { date, submitted: dayRows.length, averageAccuracy: StudentDashboardService.average(accuracies) };
    });
  }

  // Submissions of assignments that still exist, grouped per assignment in submission order
  private toAssignmentStats(rows: Practice.DashboardRecord[]): Practice.DashboardAssignmentDTO[] {
    const groups = new Map<string, Practice.DashboardRecord[]>();
    rows.forEach((row) => {
      if (!row.assignmentId || !row.assignment || row.assignment.deletedAt) return;
      groups.set(row.assignmentId, [...(groups.get(row.assignmentId) ?? []), row]);
    });
    return [...groups.entries()].map(([assignmentId, assignmentRows]) => {
      const accuracies = assignmentRows.filter(StudentDashboardService.isScored).map((row) => row.accuracy);
      return {
        assignmentId,
        title: assignmentRows[0].assignment!.title,
        submissionCount: assignmentRows.length,
        firstAccuracy: accuracies.length > 0 ? StudentDashboardService.round(accuracies[0]) : null,
        latestAccuracy: accuracies.length > 0 ? StudentDashboardService.round(accuracies[accuracies.length - 1]) : null,
        deltaPercent: StudentDashboardService.delta(accuracies)
      };
    });
  }

  private pickMostSubmitted(assignments: Practice.DashboardAssignmentDTO[]): Practice.DashboardAssignmentDTO | null {
    return assignments.reduce<Practice.DashboardAssignmentDTO | null>(
      (best, assignment) => (!best || assignment.submissionCount > best.submissionCount ? assignment : best), null
    );
  }

  // Only a real improvement is highlighted: an assignment whose accuracy did not rise is never "most improved"
  private pickMostImproved(assignments: Practice.DashboardAssignmentDTO[]): Practice.DashboardAssignmentDTO | null {
    return assignments.reduce<Practice.DashboardAssignmentDTO | null>((best, assignment) => {
      if (assignment.deltaPercent === null || assignment.deltaPercent <= 0) return best;
      return !best || assignment.deltaPercent > best.deltaPercent! ? assignment : best;
    }, null);
  }

  private toModeProgress(rows: Practice.DashboardRecord[], practiceMode: Practice.PracticeMode): Practice.DashboardModeDTO {
    const scored = rows.filter((row): row is ScoredRecord => row.practiceMode === practiceMode && StudentDashboardService.isScored(row));
    const points = scored.slice(-PracticeConstant.dashboard.TREND_POINTS).map((row) => ({
      accuracy: StudentDashboardService.round(row.accuracy), submittedAt: row.createdAt.toISOString()
    }));
    const accuracies = points.map((point) => point.accuracy);
    return {
      completed: scored.length,
      points,
      latestAccuracy: accuracies.length > 0 ? accuracies[accuracies.length - 1] : null,
      averageAccuracy: StudentDashboardService.average(accuracies),
      deltaPercent: StudentDashboardService.delta(accuracies)
    };
  }
}
