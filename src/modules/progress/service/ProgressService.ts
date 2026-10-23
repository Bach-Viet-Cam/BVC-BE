import AppError from '../../../utils/AppError.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import GradingSettingsService from '../../platform/service/GradingSettingsService.ts';
import ProgressConstant from '../constant/ProgressConstant.ts';
import ProgressRepository from '../repository/ProgressRepository.ts';
import ProgressAccessService from './ProgressAccessService.ts';
import ProgressCalculator from './ProgressCalculator.ts';

const limits = ProgressConstant.limits;

// UC-12 Track Student Progress (read only, computed on read).
export default class ProgressService {
  static async getClassProgress(classId: string, lecturerId: string): Promise<Backend.ClassProgressDTO> {
    await ClassAccessService.assertOwnedClass(classId, lecturerId);
    const [settings, members, submissions] = await Promise.all([
      GradingSettingsService.getGradingSettings(),
      ProgressRepository.findActiveMembers(classId),
      ProgressRepository.findCountedSubmissions(classId)
    ]);

    const byStudent = new Map<string, Backend.CountedSubmissionRow[]>();
    for (const row of submissions) byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row]);

    const counts = { ON_TRACK: 0, AT_RISK: 0, BEHIND: 0, NO_DATA: 0 };
    const students = members.map((member) => {
      const rows = byStudent.get(member.id) ?? [];
      const average = ProgressCalculator.averageOfBest(rows);
      const status = ProgressCalculator.resolveStatus(average, settings);
      counts[status ?? 'NO_DATA'] += 1;
      const lastSubmittedAt = rows.reduce<Date | null>((latest, row) => (!latest || row.submittedAt > latest ? row.submittedAt : latest), null);
      return {
        studentId: member.id,
        fullName: member.username,
        studentCode: member.studentCode,
        average,
        status,
        assignmentsWithSubmissions: new Set(rows.map((row) => row.assignmentId)).size,
        lastSubmittedAt: lastSubmittedAt?.toISOString() ?? null
      };
    });
    return { counts, students };
  }

  static async getStudentSummary(classId: string, studentId: string, viewer: Backend.UserDTO, now: Date = new Date()): Promise<Backend.StudentSummaryDTO> {
    const { classRecord, student } = await ProgressAccessService.assertCanViewStudent(classId, studentId, viewer);
    const classStartDate = DateTimeUtil.toIsoDate(classRecord.startDate);
    const sevenDaysAgo = new Date(now.getTime() - limits.RECENT_DAYS * DateTimeUtil.dayInMilliseconds);
    const [settings, rows, totalSessions, sessionsLast7Days] = await Promise.all([
      GradingSettingsService.getGradingSettings(),
      ProgressRepository.findCountedSubmissions(classId, [studentId]),
      ProgressRepository.countSessions(classId, studentId),
      ProgressRepository.countSessions(classId, studentId, sevenDaysAgo)
    ]);
    const average = ProgressCalculator.averageOfBest(rows);
    return {
      student: { id: student.id, fullName: student.username, studentCode: student.studentCode },
      class: { id: classRecord.id, name: classRecord.name, cohort: classRecord.cohort, instrument: classRecord.instrument, startDate: classStartDate },
      average,
      status: ProgressCalculator.resolveStatus(average, settings),
      minAccuracy: settings.minAccuracy,
      totalSessions,
      sessionsLast7Days,
      weekly: ProgressCalculator.weeklyAverages(classStartDate, rows)
    };
  }

  static async getStudentHistory(
    classId: string,
    studentId: string,
    viewer: Backend.UserDTO,
    query: Backend.StudentHistoryQuery
  ): Promise<{ items: Backend.StudentHistoryItemDTO[]; pagination: Backend.PaginationMeta }> {
    if (query.from && query.to && query.from > query.to) {
      throw AppError.fieldError(400, { field: 'from', code: 'MSG-04', message: ProgressConstant.messages.FROM_AFTER_TO });
    }
    await ProgressAccessService.assertCanViewStudent(classId, studentId, viewer);
    // Calendar days are Vietnam days, both ends inclusive.
    const range = {
      from: query.from ? new Date(`${query.from}T00:00:00.000+07:00`) : undefined,
      to: query.to ? new Date(`${query.to}T23:59:59.999+07:00`) : undefined
    };
    const { rows, total } = await ProgressRepository.findClassSubmissions(classId, studentId, range, {
      skip: (query.page - 1) * query.limit,
      take: query.limit
    });
    return {
      items: rows.map((row) => ({
        submissionId: row.id,
        assignmentId: row.assignmentId,
        assignmentTitle: row.title,
        kind: row.kind,
        status: row.status,
        accuracy: row.accuracy,
        submittedAt: row.submittedAt.toISOString()
      })),
      pagination: { page: query.page, limit: query.limit, total }
    };
  }
}
