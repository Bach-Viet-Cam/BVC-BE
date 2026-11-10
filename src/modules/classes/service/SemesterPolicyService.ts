import DateTimeUtil from '../../../utils/DateTimeUtil.ts';

// Current semester rules for the lecturer assignment pages: strict (no fallback to the nearest semester).
export default class SemesterPolicyService {
  // The semester whose date range contains today (Vietnam time, both ends inclusive).
  static findCurrent(semesters: Backend.Semester[], now: Date = new Date()): Backend.Semester | null {
    const today = DateTimeUtil.todayInVietnam(now);
    return semesters.find((semester) => semester.startDate <= today && today <= semester.endDate) ?? null;
  }

  static resolveEmptyReason(input: { semesters: Backend.Semester[]; current: Backend.Semester | null; classCount: number }): Backend.OverviewEmptyReason | null {
    if (input.semesters.length === 0) return 'NO_SEMESTER_CONFIGURED';
    if (!input.current) return 'NO_CURRENT_SEMESTER';
    if (input.classCount === 0) return 'NO_CLASSES_IN_SEMESTER';
    return null;
  }
}
