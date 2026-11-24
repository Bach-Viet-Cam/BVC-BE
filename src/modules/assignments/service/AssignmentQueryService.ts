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
import AssignmentPracticeStatsCalculator from './AssignmentPracticeStatsCalculator.ts';
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
      return { semester: null, emptyReason: SemesterPolicyService.resolveEmptyReason({ semesters, current: null, classCount: 0 }), classes: [], sheetStats: [] };
    }

    const classRecords = await AssignmentRepository.findClassesWithAssignments(lecturerId, semester.name);
    const counts = await AssignmentQueryService.loadCopyCounts(classRecords);

    const classes = classRecords.map((record) => {
      const assignments = record.assignments.map((assignment) => AssignmentDTO.toOverviewAssignment(assignment, counts.forAssignment(record.id, assignment.id)));
      return { id: record.id, name: record.name, status: record.status, memberCount: (counts.membersByClass.get(record.id) ?? new Set<string>()).size, assignments };
    });
    return { semester, emptyReason: SemesterPolicyService.resolveEmptyReason({ semesters, current: semester, classCount: classes.length }), classes, sheetStats: await AssignmentQueryService.buildSheetStats(classRecords, counts.membersByClass, now) };
  }

  // One entry per sheet, scoped exactly like getSheetGroup; a single practice query serves every sheet.
  private static async buildSheetStats(classRecords: Backend.ClassWithAssignmentsRecord[], membersByClass: Map<string, Set<string>>, now: Date): Promise<Backend.OverviewSheetStatDTO[]> {
    const sheetIds = new Set<string>();
    for (const record of classRecords) {
      for (const assignment of record.assignments) {
        const sheetId = assignment.currentVersion?.sheetMusic?.id;
        if (sheetId) sheetIds.add(sheetId);
      }
    }

    const scopes = [...sheetIds].map((sheetId) => {
      const sheetClasses = classRecords
        .map((record) => ({ ...record, assignments: record.assignments.filter((assignment) => assignment.currentVersion?.sheetMusic?.id === sheetId) }))
        .filter((record) => record.assignments.length > 0);
      return { sheetId, scope: AssignmentQueryService.buildSheetStatsScope(sheetClasses, membersByClass) };
    });

    const practices = await SubmissionRepository.findCountedPractices(scopes.flatMap(({ scope }) => [...scope.assignmentClassIds.keys()]));
    return scopes
      .filter(({ scope }) => scope.assignmentClassIds.size > 0)
      .map(({ sheetId, scope }) => {
        const stats = AssignmentPracticeStatsCalculator.summarize({ practices, assignmentClassIds: scope.assignmentClassIds, membersByClass: scope.membersByClass, now });
        return { sheetMusicId: sheetId, practicedStudents: stats.practicedStudents, memberCount: stats.memberCount, practiceCount: stats.totalPractices };
      });
  }

  // Active members per class plus the per-assignment practice / submitter counts shared by the overview and the sheet group.
  private static async loadCopyCounts(classRecords: Backend.ClassWithAssignmentsRecord[]) {
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

    return {
      membersByClass,
      forAssignment: (classId: string, assignmentId: string) => {
        const classMembers = membersByClass.get(classId) ?? new Set<string>();
        return {
          practiceCount: practiceCounts.get(assignmentId) ?? 0,
          submittedCount: submitters.filter((row) => row.assignmentId === assignmentId && classMembers.has(row.studentId)).length,
          memberCount: classMembers.size
        };
      }
    };
  }

  // Every copy of one sheet across the lecturer's current-semester classes. Drafts are listed but stay out of the stats.
  static async getSheetGroup(lecturerId: string, sheetMusicId: string, now: Date = new Date()): Promise<Backend.SheetGroupDetailDTO> {
    const semester = SemesterPolicyService.findCurrent(await SystemConfigService.getSemesters(), now);
    if (!semester) throw AppError.notFound(messages.SHEET_GROUP_NOT_FOUND);

    const classRecords = (await AssignmentRepository.findClassesWithAssignments(lecturerId, semester.name))
      .map((record) => ({ ...record, assignments: record.assignments.filter((assignment) => assignment.currentVersion?.sheetMusic?.id === sheetMusicId) }))
      .filter((record) => record.assignments.length > 0);
    if (classRecords.length === 0) throw AppError.notFound(messages.SHEET_GROUP_NOT_FOUND);

    const [counts, settings, sheetMedia] = await Promise.all([
      AssignmentQueryService.loadCopyCounts(classRecords),
      GradingSettingsService.getGradingSettings(),
      AssignmentRepository.findSheetMedia(sheetMusicId)
    ]);

    const assignments = classRecords.flatMap((record) =>
      record.assignments.map((assignment) => {
        const base = AssignmentDTO.toBaseDTO(assignment);
        return {
          ...AssignmentDTO.toOverviewAssignment(assignment, counts.forAssignment(record.id, assignment.id)),
          className: base.className,
          maxSubmissions: base.maxSubmissions,
          effectiveBpm: base.effectiveBpm,
          minAccuracy: assignment.minAccuracy ?? settings.minAccuracy,
          publishedAt: base.publishedAt,
          createdBy: assignment.createdBy ? { id: assignment.createdBy.id, fullName: assignment.createdBy.username } : null
        };
      })
    );

    const { assignmentClassIds, membersByClass, classNames } = AssignmentQueryService.buildSheetStatsScope(classRecords, counts.membersByClass);
    const practices = await SubmissionRepository.findCountedPractices([...assignmentClassIds.keys()]);
    const input = { practices, assignmentClassIds, membersByClass, now };

    return {
      semester,
      sheetMusic: AssignmentDTO.toBaseDTO(classRecords[0].assignments[0]).sheetMusic as Backend.AssignmentSheetMusicDTO,
      media: sheetMedia ? await AssignmentDTO.toMediaDTO(sheetMedia) : { sheet: null, referenceAudio: null, tutorialVideo: null },
      assignments,
      practiceStats: AssignmentPracticeStatsCalculator.summarize(input),
      byClass: AssignmentPracticeStatsCalculator.byClass(input, classNames)
    };
  }

  // Only PUBLISHED / CLOSED copies count; a class with none of them is left out of the member map and the class names.
  private static buildSheetStatsScope(classRecords: Backend.ClassWithAssignmentsRecord[], membersByClass: Map<string, Set<string>>) {
    const assignmentClassIds = new Map<string, string>();
    const scopedMembers = new Map<string, Set<string>>();
    const classNames = new Map<string, string>();
    for (const record of classRecords) {
      const counted = record.assignments.filter((assignment) => assignment.status !== 'DRAFT');
      if (counted.length === 0) continue;
      for (const assignment of counted) assignmentClassIds.set(assignment.id, record.id);
      scopedMembers.set(record.id, membersByClass.get(record.id) ?? new Set<string>());
      classNames.set(record.id, record.name);
    }
    return { assignmentClassIds, membersByClass: scopedMembers, classNames };
  }

  static async getAssignmentDetail(assignmentId: string, lecturerId: string): Promise<Backend.AssignmentDetailDTO> {
    const record = await AssignmentAccessService.assertOwnedAssignment(assignmentId, lecturerId);
    const sheetMusicId = record.currentVersion?.sheetMusic?.id ?? null;
    const [settings, members, snapshotsByStudent, practices, sheetMedia] = await Promise.all([
      GradingSettingsService.getGradingSettings(),
      SubmissionRepository.findActiveMembers([record.classId]),
      SubmissionRepository.findSnapshotsByStudent(assignmentId),
      SubmissionRepository.findCountedPractices([assignmentId]),
      sheetMusicId ? AssignmentRepository.findSheetMedia(sheetMusicId) : Promise.resolve(null)
    ]);
    const classMembers = new Set(members.map(({ user }) => user.id));
    const practiceStats = AssignmentPracticeStatsCalculator.summarize({
      practices,
      assignmentClassIds: new Map([[record.id, record.classId]]),
      membersByClass: new Map([[record.classId, classMembers]]),
      now: new Date()
    });
    const students = members.map(({ user: student }) => {
      const summary = AssignmentProgressCalculator.summarize(snapshotsByStudent.get(student.id) ?? [], record.minAccuracy ?? settings.minAccuracy);
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
    return {
      ...AssignmentDTO.toBaseDTO(record),
      students,
      practiceStats,
      minAccuracy: record.minAccuracy ?? settings.minAccuracy,
      createdBy: record.createdBy ? { id: record.createdBy.id, fullName: record.createdBy.username } : null,
      media: sheetMedia ? await AssignmentDTO.toMediaDTO(sheetMedia) : null
    };
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
