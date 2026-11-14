import AdminStatsPolicyService from '../../platform/service/AdminStatsPolicyService.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';

export default class AssignmentPracticeStatsCalculator {
  static summarize(input: Backend.PracticeStatsInput): Backend.PracticeStatsDTO {
    const scoped = AssignmentPracticeStatsCalculator.scopePractices(input);
    const practicedByClass = AssignmentPracticeStatsCalculator.practicedStudentsByClass(scoped, input.membersByClass);
    let practicedStudents = 0;
    for (const students of practicedByClass.values()) practicedStudents += students.size;
    let memberCount = 0;
    for (const members of input.membersByClass.values()) memberCount += members.size;
    const averagePerStudent = practicedStudents === 0 ? 0 : Math.round((scoped.length / practicedStudents) * 10) / 10;
    return {
      totalPractices: scoped.length,
      practicedStudents,
      memberCount,
      averagePerStudent,
      last7Days: AdminStatsPolicyService.buildDailySeries(
        scoped.map((entry) => entry.practice.createdAt),
        AssignmentConstant.seriesDays,
        input.now,
        AssignmentConstant.utcOffsetMinutes
      )
    };
  }

  static byClass(input: Backend.PracticeStatsInput, classNames: Map<string, string>): Backend.ClassPracticeDTO[] {
    const scoped = AssignmentPracticeStatsCalculator.scopePractices(input);
    const practicedByClass = AssignmentPracticeStatsCalculator.practicedStudentsByClass(scoped, input.membersByClass);
    return [...classNames].map(([classId, className]) => ({
      classId,
      className,
      practicedStudents: practicedByClass.get(classId)?.size ?? 0,
      memberCount: input.membersByClass.get(classId)?.size ?? 0
    }));
  }

  private static scopePractices(input: Backend.PracticeStatsInput): Array<{ practice: Backend.CountedPractice; classId: string }> {
    const scoped: Array<{ practice: Backend.CountedPractice; classId: string }> = [];
    for (const practice of input.practices) {
      const classId = input.assignmentClassIds.get(practice.assignmentId);
      if (classId !== undefined) scoped.push({ practice, classId });
    }
    return scoped;
  }

  private static practicedStudentsByClass(
    scoped: Array<{ practice: Backend.CountedPractice; classId: string }>,
    membersByClass: Map<string, Set<string>>
  ): Map<string, Set<string>> {
    const practicedByClass = new Map<string, Set<string>>();
    for (const { practice, classId } of scoped) {
      if (!membersByClass.get(classId)?.has(practice.studentId)) continue;
      const students = practicedByClass.get(classId) ?? new Set<string>();
      students.add(practice.studentId);
      practicedByClass.set(classId, students);
    }
    return practicedByClass;
  }
}
