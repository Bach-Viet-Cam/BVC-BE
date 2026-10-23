import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import GradingSettingsService from '../../platform/service/GradingSettingsService.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import LeaderboardConstant from '../constant/LeaderboardConstant.ts';
import LeaderboardRepository from '../repository/LeaderboardRepository.ts';
import LeaderboardSourceRepository from '../repository/LeaderboardSourceRepository.ts';
import LeaderboardMetricCalculator from './LeaderboardMetricCalculator.ts';
import LeaderboardRankingCalculator from './LeaderboardRankingCalculator.ts';

const countedStatuses: readonly string[] = ['PUBLISHED', 'CLOSED'];

const groupBy = <T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
};

interface Membership { studentId: string; studentCode: string | null; classes: Array<{ id: string; name: string }> }

// Builds the daily ranking snapshot of the current semester (D1-D11); the read API never recomputes.
export default class LeaderboardSnapshotService {
  // D1: the semester whose dates cover today (UTC+7); no fallback to the nearest one
  static async findCurrentSemester(now: Date): Promise<Backend.Semester | null> {
    const today = DateTimeUtil.todayInVietnam(now);
    const semesters = await SystemConfigService.getSemesters();
    return semesters.find((semester) => semester.startDate <= today && today <= semester.endDate) ?? null;
  }

  static async build(now: Date = new Date()): Promise<Backend.LeaderboardBuildResult | null> {
    const clock = Date.now();
    console.info('[bảng xếp hạng] Bắt đầu làm mới:', now.toISOString());
    try {
      const semester = await LeaderboardSnapshotService.findCurrentSemester(now);
      if (!semester) {
        console.info('[bảng xếp hạng] Không có học kỳ hiện tại, bỏ qua.');
        return null;
      }
      const entries = await LeaderboardSnapshotService.computeEntries(semester, now);
      const durationMs = Date.now() - clock;
      const today = DateTimeUtil.todayInVietnam(now);
      const header: Backend.LeaderboardSnapshotHeader = {
        semester: semester.name,
        periodStart: semester.startDate,
        periodEnd: semester.endDate,
        weekStart: DateTimeUtil.startOfWeekInVietnam(today),
        snapshotDate: today,
        startedAt: now,
        generatedAt: now,
        durationMs
      };
      const snapshotId = await LeaderboardRepository.saveSnapshot(header, entries);
      console.info(`[bảng xếp hạng] Hoàn tất học kỳ ${semester.name}: ${entries.length} dòng, ${durationMs} ms.`);
      return { semester: semester.name, snapshotId, generatedAt: now, rowCount: entries.length, durationMs };
    } catch (error: unknown) {
      console.error('[bảng xếp hạng] Làm mới thất bại:', error);
      throw error;
    }
  }

  private static async computeEntries(semester: Backend.Semester, now: Date): Promise<Backend.LeaderboardEntryInput[]> {
    const { minAccuracy } = await GradingSettingsService.getGradingSettings();
    const members = await LeaderboardSourceRepository.findSemesterMembers(semester.name);
    if (members.length === 0) return [];
    const memberships = LeaderboardSnapshotService.groupMemberships(members);
    const studentIds = memberships.map((membership) => membership.studentId);
    const classIds = [...new Set(members.map((member) => member.classId))];
    const from = DateTimeUtil.startOfDayInVietnam(semester.startDate);
    const to = DateTimeUtil.startOfDayInVietnam(DateTimeUtil.addDays(semester.endDate, 1));
    const [submissions, counted, bonuses] = await Promise.all([
      LeaderboardSourceRepository.findSubmissions(studentIds, classIds, from, to),
      LeaderboardSourceRepository.findCountedAssignments(classIds),
      LeaderboardSourceRepository.findBonusAssignments(classIds)
    ]);
    const submissionsByStudent = groupBy(submissions, (submission) => submission.studentId);
    const countedByClass = groupBy(counted, (assignment) => assignment.classId);
    const bonusesByClass = groupBy(bonuses, (assignment) => assignment.classId);
    const window = { from: semester.startDate, to: semester.endDate };
    const today = DateTimeUtil.todayInVietnam(now);
    const weekStart = DateTimeUtil.startOfWeekInVietnam(today);

    const metrics: Backend.LeaderboardStudentMetrics[] = [];
    for (const membership of memberships) {
      const studentSubmissions = submissionsByStudent.get(membership.studentId) ?? [];
      const classesOfStudent = membership.classes.map((classInfo) => classInfo.id);
      const activity: Backend.LeaderboardActivity = {
        submissions: studentSubmissions.map((record) => ({
          assignmentId: record.assignmentId,
          kind: record.kind,
          isCounted: countedStatuses.includes(record.assignmentStatus) && record.kind !== 'BONUS',
          status: record.status,
          accuracy: record.accuracy,
          submittedAt: record.submittedAt
        })),
        assignmentIds: classesOfStudent.flatMap((id) => (countedByClass.get(id) ?? []).map((assignment) => assignment.id)),
        bonusAssignments: classesOfStudent.flatMap((id) => (bonusesByClass.get(id) ?? []).map(({ id: assignmentId, bonusPoints }) => ({ id: assignmentId, bonusPoints })))
      };
      if (!LeaderboardMetricCalculator.hasActivity(activity, window)) continue;
      metrics.push(LeaderboardSnapshotService.computeMetrics(membership, activity, { studentSubmissions }, { minAccuracy, today, weekStart }));
    }
    return LeaderboardSnapshotService.buildEntries(metrics);
  }

  private static groupMemberships(members: Backend.LeaderboardMemberRecord[]): Membership[] {
    const byStudent = new Map<string, Membership>();
    for (const member of members) {
      const existing = byStudent.get(member.studentId) ?? { studentId: member.studentId, studentCode: member.studentCode, classes: [] };
      existing.classes.push({ id: member.classId, name: member.className });
      byStudent.set(member.studentId, existing);
    }
    return [...byStudent.values()];
  }

  private static computeMetrics(
    membership: Membership,
    activity: Backend.LeaderboardActivity,
    records: { studentSubmissions: Backend.LeaderboardSubmissionRecord[] },
    context: { minAccuracy: number; today: string; weekStart: string }
  ): Backend.LeaderboardStudentMetrics {
    const days = LeaderboardMetricCalculator.activityDays(activity, LeaderboardConstant.streakMinActivitiesPerDay);
    return {
      studentId: membership.studentId,
      studentCode: membership.studentCode,
      classId: LeaderboardSnapshotService.pickPrimaryClass(membership, records),
      longestStreak: LeaderboardMetricCalculator.longestStreak(days),
      currentStreak: LeaderboardMetricCalculator.currentStreak(days, context.today),
      accuracy: LeaderboardMetricCalculator.accuracy(activity.submissions),
      improvement: LeaderboardMetricCalculator.weeklyImprovement(activity.submissions, context.weekStart),
      weeklyActivity: LeaderboardMetricCalculator.weeklyActivity(activity, context.weekStart),
      bonus: LeaderboardMetricCalculator.confirmedBonus(activity.submissions, activity.bonusAssignments),
      completion: LeaderboardMetricCalculator.completionRate(activity.submissions, activity.assignmentIds, context.minAccuracy)
    };
  }

  // D2: the class with the most activities; a tie goes to the name that sorts first
  private static pickPrimaryClass(
    membership: Membership,
    records: { studentSubmissions: Backend.LeaderboardSubmissionRecord[] }
  ): string {
    const counts = new Map<string, number>();
    const classIds = records.studentSubmissions.map((record) => record.classId);
    for (const classId of classIds) if (classId) counts.set(classId, (counts.get(classId) ?? 0) + 1);
    const sorted = [...membership.classes].sort((left, right) => (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0) || left.name.localeCompare(right.name, 'vi'));
    return sorted[0].id;
  }

  private static buildEntries(metrics: Backend.LeaderboardStudentMetrics[]): Backend.LeaderboardEntryInput[] {
    const criteriaRows = metrics.map((metric) => ({
      studentId: metric.studentId,
      criteria: { streak: metric.longestStreak, accuracy: metric.accuracy, bonus: metric.bonus, completion: metric.completion }
    }));
    const scores = LeaderboardRankingCalculator.overallScores(criteriaRows, LeaderboardConstant.overallCriteria);
    const byId = new Map(metrics.map((metric) => [metric.studentId, metric]));
    const rawById = new Map(criteriaRows.map((row) => [row.studentId, row.criteria]));
    const overall = LeaderboardSnapshotService.toEntries(
      'OVERALL',
      metrics.map((metric, index) => ({ metric, value: scores[index].score })),
      (studentId) => ({ raw: rawById.get(studentId) ?? null, normalized: scores.find((score) => score.studentId === studentId)?.normalized ?? null })
    );
    const tab = (category: Backend.LeaderboardCategoryEnum, pick: (metric: Backend.LeaderboardStudentMetrics) => number | null) =>
      LeaderboardSnapshotService.toEntries(
        category,
        [...byId.values()].flatMap((metric) => {
          const value = pick(metric);
          return value === null ? [] : [{ metric, value }];
        }),
        () => null
      );
    return [
      ...overall,
      ...tab('ACCURACY', (metric) => metric.accuracy),
      ...tab('IMPROVEMENT', (metric) => metric.improvement),
      ...tab('STREAK', (metric) => (metric.currentStreak > 0 ? metric.currentStreak : null)),
      ...tab('ACTIVITY', (metric) => (metric.weeklyActivity > 0 ? metric.weeklyActivity : null))
    ];
  }

  private static toEntries(
    category: Backend.LeaderboardCategoryEnum,
    rows: Array<{ metric: Backend.LeaderboardStudentMetrics; value: number }>,
    criteriaOf: (studentId: string) => Record<string, unknown> | null
  ): Backend.LeaderboardEntryInput[] {
    const classByStudent = new Map(rows.map((row) => [row.metric.studentId, row.metric.classId]));
    const ranked = LeaderboardRankingCalculator.rank(
      rows.map((row) => ({ studentId: row.metric.studentId, studentCode: row.metric.studentCode, value: row.value })),
      'desc'
    );
    return ranked.map((entry) => ({
      category,
      studentId: entry.studentId,
      classId: classByStudent.get(entry.studentId) as string,
      rank: entry.rank,
      position: entry.position,
      value: entry.value,
      criteria: criteriaOf(entry.studentId)
    }));
  }
}
