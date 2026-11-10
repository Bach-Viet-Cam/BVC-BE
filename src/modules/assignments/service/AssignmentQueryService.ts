import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import SemesterPolicyService from '../../classes/service/SemesterPolicyService.ts';
import GradingSettingsService from '../../platform/service/GradingSettingsService.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import AssignmentDTO from '../dto/AssignmentDTO.ts';
import AssignmentRepository from '../repository/AssignmentRepository.ts';
import SubmissionRepository from '../repository/SubmissionRepository.ts';
import AssignmentAccessService from './AssignmentAccessService.ts';
import AssignmentProgressCalculator from './AssignmentProgressCalculator.ts';

const messages = AssignmentConstant.messages;

// Read side for lecturers (spec §4.3). Only students with an active membership are listed / counted.
export default class AssignmentQueryService {
  static async listAssignments(lecturerId: string, query: Backend.AssignmentListQuery): Promise<{ items: Backend.AssignmentListItemDTO[]; pagination: Backend.PaginationMeta }> {
    const { records, total } = await AssignmentRepository.findLecturerAssignments(lecturerId, query);
    const classIds = [...new Set(records.map((record) => record.classId))];
    const [members, submitters] = await Promise.all([
      SubmissionRepository.findActiveMembers(classIds),
      SubmissionRepository.findCountedSubmitters(records.map((record) => record.id))
    ]);

    const membersByClass = new Map<string, Set<string>>();
    for (const member of members) {
      const classMembers = membersByClass.get(member.classId) ?? new Set<string>();
      classMembers.add(member.user.id);
      membersByClass.set(member.classId, classMembers);
    }

    const items = records.map((record) => {
      const base = AssignmentDTO.toBaseDTO(record);
      const classMembers = membersByClass.get(record.classId) ?? new Set<string>();
      const submittedCount = submitters.filter((row) => row.assignmentId === record.id && classMembers.has(row.studentId)).length;
      return {
        id: base.id,
        classId: base.classId,
        className: base.className,
        status: base.status,
        version: base.version,
        title: base.title,
        kind: base.kind,
        submittedCount,
        memberCount: classMembers.size,
        updatedAt: base.updatedAt
      };
    });
    return { items, pagination: { page: query.page, limit: query.limit, total } };
  }

  // One read model for the lecturer assignment page and its assign dialog: the current-semester classes with their assignments.
  static async getOverview(lecturerId: string, now: Date = new Date()): Promise<Backend.AssignmentOverviewDTO> {
    const semesters = await SystemConfigService.getSemesters();
    const semester = SemesterPolicyService.findCurrent(semesters, now);
    if (!semester) {
      return { semester: null, emptyReason: SemesterPolicyService.resolveEmptyReason({ semesters, current: null, classCount: 0 }), classes: [] };
    }

    const classRecords = await AssignmentRepository.findClassesWithAssignments(lecturerId, semester.name);
    const assignmentIds = classRecords.flatMap((record) => record.assignments.map((assignment) => assignment.id));
    const [members, submitters, practiceCounts] = await Promise.all([
      SubmissionRepository.findActiveMembers(classRecords.map((record) => record.id)),
      SubmissionRepository.findCountedSubmitters(assignmentIds),
      SubmissionRepository.countPracticesByAssignment(assignmentIds)
    ]);

    const membersByClass = new Map<string, Set<string>>();
    for (const member of members) {
      const classMembers = membersByClass.get(member.classId) ?? new Set<string>();
      classMembers.add(member.user.id);
      membersByClass.set(member.classId, classMembers);
    }

    const classes = classRecords.map((record) => {
      const classMembers = membersByClass.get(record.id) ?? new Set<string>();
      const assignments = record.assignments.map((assignment) =>
        AssignmentDTO.toOverviewAssignment(assignment, {
          practiceCount: practiceCounts.get(assignment.id) ?? 0,
          submittedCount: submitters.filter((row) => row.assignmentId === assignment.id && classMembers.has(row.studentId)).length,
          memberCount: classMembers.size
        })
      );
      return { id: record.id, name: record.name, status: record.status, memberCount: classMembers.size, assignments };
    });
    return { semester, emptyReason: SemesterPolicyService.resolveEmptyReason({ semesters, current: semester, classCount: classes.length }), classes };
  }

  static async getAssignmentDetail(assignmentId: string, lecturerId: string): Promise<Backend.AssignmentDetailDTO> {
    const record = await AssignmentAccessService.assertOwnedAssignment(assignmentId, lecturerId);
    const [settings, members, snapshotsByStudent] = await Promise.all([
      GradingSettingsService.getGradingSettings(),
      SubmissionRepository.findActiveMembers([record.classId]),
      SubmissionRepository.findSnapshotsByStudent(assignmentId)
    ]);
    const students = members.map(({ user: student }) => {
      const summary = AssignmentProgressCalculator.summarize(snapshotsByStudent.get(student.id) ?? [], settings.minAccuracy);
      return {
        studentId: student.id,
        fullName: student.username,
        studentCode: student.studentCode,
        status: summary.status,
        submissionCount: summary.submissionCount,
        lastSubmittedAt: summary.lastSubmittedAt?.toISOString() ?? null,
        bestAccuracy: summary.bestAccuracy
      };
    });
    return { ...AssignmentDTO.toBaseDTO(record), students };
  }

  static async getStudentSubmissions(assignmentId: string, studentId: string, lecturerId: string): Promise<Backend.StudentSubmissionsDTO> {
    const record = await AssignmentAccessService.assertOwnedAssignment(assignmentId, lecturerId);
    const [membership, submissions, profile] = await Promise.all([
      MemberRepository.findActiveMembership(record.classId, studentId),
      SubmissionRepository.findStudentSubmissions(assignmentId, studentId),
      SubmissionRepository.findStudentProfile(studentId)
    ]);
    if (!profile || (!membership && submissions.length === 0)) throw AppError.notFound(messages.STUDENT_NOT_FOUND);

    const numbered = submissions.map((submission, index) => ({
      ...submission,
      attemptNumber: index + 1,
      submittedAt: submission.submittedAt.toISOString(),
      comment: submission.comment ? { content: submission.comment.content, updatedAt: submission.comment.updatedAt.toISOString() } : null
    }));
    return {
      student: { id: profile.id, fullName: profile.username, studentCode: profile.studentCode },
      // A17 / A18: comments are locked in a finished class or for a student who left the class.
      canComment: record.class.status === 'ACTIVE' && membership !== null,
      submissions: numbered.reverse()
    };
  }

  static async listClassSheetMusic(target: { classId?: string; instrumentId?: string }, lecturerId: string): Promise<Backend.ClassSheetMusicDTO[]> {
    if (target.classId) {
      const classRecord = await ClassAccessService.assertOwnedClass(target.classId, lecturerId);
      return SubmissionRepository.findClassSheetMusic(classRecord.instrumentId);
    }
    return SubmissionRepository.findClassSheetMusic(target.instrumentId as string);
  }
}
