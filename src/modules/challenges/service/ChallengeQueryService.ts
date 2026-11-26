import AppError from '../../../utils/AppError.ts';
import AssignmentDTO from '../../assignments/dto/AssignmentDTO.ts';
import AssignmentRepository from '../../assignments/repository/AssignmentRepository.ts';
import SubmissionRepository from '../../assignments/repository/SubmissionRepository.ts';
import AssignmentPracticeStatsCalculator from '../../assignments/service/AssignmentPracticeStatsCalculator.ts';
import AssignmentProgressCalculator from '../../assignments/service/AssignmentProgressCalculator.ts';
import GradingSettingsService from '../../platform/service/GradingSettingsService.ts';
import ChallengeConstant from '../constant/ChallengeConstant.ts';
import ChallengeDTO from '../dto/ChallengeDTO.ts';
import ChallengeRepository from '../repository/ChallengeRepository.ts';
import ChallengeAccessService from './ChallengeAccessService.ts';

// Read side for the lecturer's own challenges.
export default class ChallengeQueryService {
  static async list(lecturerId: string, query: Backend.ChallengeListQuery): Promise<{ items: Backend.ChallengeDTO[]; pagination: Backend.PaginationMeta }> {
    const { records, total } = await ChallengeRepository.findByLecturer(lecturerId, query);
    const now = new Date();
    return { items: records.map((record) => ChallengeDTO.toDTO(record, now)), pagination: { page: query.page, limit: query.limit, total } };
  }

  static async get(lecturerId: string, challengeId: string): Promise<Backend.ChallengeDTO> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    return ChallengeDTO.toDTO(record);
  }

  // Same rules as the assignment drawer: only submissions linked at submit time count, rejected / failed ones do not.
  static async getDetail(lecturerId: string, challengeId: string): Promise<Backend.ChallengeDetailDTO> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    const classIds = record.classes.map(({ class: classRecord }) => classRecord.id);
    const [settings, members, snapshotsByStudent, sheetMedia] = await Promise.all([
      GradingSettingsService.getGradingSettings(),
      classIds.length > 0 ? SubmissionRepository.findActiveMembers(classIds) : Promise.resolve([]),
      ChallengeRepository.findSnapshotsByStudent(challengeId),
      record.sheetMusicId ? AssignmentRepository.findSheetMedia(record.sheetMusicId) : Promise.resolve(null)
    ]);
    const effectiveMinAccuracy = record.minAccuracy ?? settings.minAccuracy;
    const classNames = new Map(record.classes.map(({ class: classRecord }) => [classRecord.id, classRecord.name]));
    const studentClass = ChallengeQueryService.assignStudentClasses(members, classIds);
    const students = members
      .filter(({ classId, user }) => studentClass.get(user.id) === classId)
      .map(({ classId, user }) => {
        const summary = AssignmentProgressCalculator.summarize(snapshotsByStudent.get(user.id) ?? [], effectiveMinAccuracy);
        return {
          studentId: user.id,
          fullName: user.username,
          studentCode: user.studentCode,
          classId,
          className: classNames.get(classId) ?? '',
          status: summary.status,
          submissionCount: summary.submissionCount,
          lastSubmittedAt: summary.lastSubmittedAt?.toISOString() ?? null,
          bestAccuracy: summary.bestAccuracy
        };
      });
    const statsInput = ChallengeQueryService.buildStatsInput(snapshotsByStudent, studentClass, classIds);
    return {
      ...ChallengeDTO.toDTO(record),
      effectiveMinAccuracy,
      students,
      practiceStats: AssignmentPracticeStatsCalculator.summarize(statsInput),
      byClass: AssignmentPracticeStatsCalculator.byClass(statsInput, classNames),
      media: sheetMedia ? await AssignmentDTO.toMediaDTO(sheetMedia) : null
    };
  }

  // A student sees only published challenges of a class they are in; anything else answers 404
  private static async assertStudentChallenge(studentId: string, challengeId: string): Promise<Backend.ChallengeRecord> {
    const record = await ChallengeRepository.findById(challengeId);
    if (!record || record.status !== 'PUBLISHED' || !(await ChallengeRepository.isStudentInChallenge(challengeId, studentId))) {
      throw AppError.notFound(ChallengeConstant.messages.CHALLENGE_NOT_FOUND);
    }
    return record;
  }

  static async listStudentSubmissionsOf(studentId: string, challengeId: string): Promise<Backend.StudentChallengeSubmissionDTO[]> {
    await ChallengeQueryService.assertStudentChallenge(studentId, challengeId);
    const submissions = await ChallengeRepository.findStudentSubmissions(challengeId, studentId);
    return submissions
      .map((submission, index) => ({ id: submission.id, attemptNumber: index + 1, status: submission.status, accuracy: submission.accuracy, submittedAt: submission.submittedAt.toISOString() }))
      .reverse();
  }

  static async getForStudent(studentId: string, challengeId: string): Promise<Backend.StudentChallengeDetailDTO> {
    const record = await ChallengeQueryService.assertStudentChallenge(studentId, challengeId);
    const [settings, snapshots] = await Promise.all([
      GradingSettingsService.getGradingSettings(),
      ChallengeRepository.findStudentSnapshots(challengeId, studentId)
    ]);
    const dto = ChallengeQueryService.toStudentDTO(record, snapshots, settings.minAccuracy, new Date());
    if (dto.displayStatus !== 'ENDED') return { ...dto, rank: null, participants: 0 };
    return { ...dto, ...(await ChallengeQueryService.standing(challengeId, studentId, dto.effectiveMinAccuracy)) };
  }

  // Competition ranking by best accuracy: equal scores share a rank; a student with no scored send has none
  private static async standing(challengeId: string, studentId: string, minAccuracy: number): Promise<{ rank: number | null; participants: number }> {
    const byStudent = await ChallengeRepository.findSnapshotsByStudent(challengeId);
    const best = new Map<string, number>();
    for (const [id, snapshots] of byStudent) {
      const score = AssignmentProgressCalculator.summarize(snapshots, minAccuracy).bestAccuracy;
      if (score !== null) best.set(id, score);
    }
    const mine = best.get(studentId);
    if (mine === undefined) return { rank: null, participants: best.size };
    return { rank: 1 + [...best.values()].filter((score) => score > mine).length, participants: best.size };
  }

  static async listForStudent(studentId: string, query: Backend.ChallengeListQuery): Promise<{ items: Backend.StudentChallengeDTO[]; pagination: Backend.PaginationMeta }> {
    const { records, total } = await ChallengeRepository.findByStudent(studentId, query);
    const [settings, snapshotsByChallenge] = await Promise.all([
      GradingSettingsService.getGradingSettings(),
      records.length > 0 ? ChallengeRepository.findStudentSnapshotsByChallenge(records.map((record) => record.id), studentId) : Promise.resolve(new Map<string, Backend.SubmissionSnapshot[]>())
    ]);
    const now = new Date();
    const items = records.map((record) => ChallengeQueryService.toStudentDTO(record, snapshotsByChallenge.get(record.id) ?? [], settings.minAccuracy, now));
    return { items, pagination: { page: query.page, limit: query.limit, total } };
  }

  private static toStudentDTO(record: Backend.ChallengeRecord, snapshots: Backend.SubmissionSnapshot[], defaultMinAccuracy: number, now: Date): Backend.StudentChallengeDTO {
    const effectiveMinAccuracy = record.minAccuracy ?? defaultMinAccuracy;
    const summary = AssignmentProgressCalculator.summarize(snapshots, effectiveMinAccuracy);
    const dto = ChallengeDTO.toDTO(record, now);
    return {
      ...dto,
      sheetMusicId: record.sheetMusicId,
      effectiveMinAccuracy,
      usedSubmissions: summary.submissionCount,
      bestAccuracy: summary.bestAccuracy,
      canPractice: dto.displayStatus === 'ACTIVE' && record.sheetMusicId !== null && summary.submissionCount < record.maxSubmissions
    };
  }

  static async getStudentSubmissions(lecturerId: string, challengeId: string, studentId: string): Promise<Backend.StudentSubmissionsDTO> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    const classIds = record.classes.map(({ class: classRecord }) => classRecord.id);
    const [members, submissions, profile] = await Promise.all([
      classIds.length > 0 ? SubmissionRepository.findActiveMembers(classIds) : Promise.resolve([]),
      ChallengeRepository.findStudentSubmissions(challengeId, studentId),
      SubmissionRepository.findStudentProfile(studentId)
    ]);
    const isMember = members.some(({ user }) => user.id === studentId);
    if (!profile || (!isMember && submissions.length === 0)) throw AppError.notFound(ChallengeConstant.messages.STUDENT_NOT_FOUND);
    const numbered = submissions.map((submission, index) => ({
      ...submission,
      attemptNumber: index + 1,
      submittedAt: submission.submittedAt.toISOString(),
      comment: null
    }));
    return {
      student: { id: profile.id, fullName: profile.username, studentCode: profile.studentCode },
      // Challenges have no lecturer comment flow
      canComment: false,
      submissions: numbered.reverse()
    };
  }

  // A student in several challenge classes is counted once, under the first of them (classes are ordered by name)
  private static assignStudentClasses(members: Array<{ classId: string; user: { id: string } }>, classIds: string[]): Map<string, string> {
    const studentClass = new Map<string, string>();
    for (const classId of classIds) {
      for (const member of members) {
        if (member.classId === classId && !studentClass.has(member.user.id)) studentClass.set(member.user.id, classId);
      }
    }
    return studentClass;
  }

  // The assignment stats calculator groups practices by a target id; here each practice targets its student's class
  private static buildStatsInput(snapshotsByStudent: Map<string, Backend.SubmissionSnapshot[]>, studentClass: Map<string, string>, classIds: string[]): Backend.PracticeStatsInput {
    const practices: Backend.CountedPractice[] = [];
    for (const [studentId, snapshots] of snapshotsByStudent) {
      const classId = studentClass.get(studentId);
      if (!classId) continue;
      for (const snapshot of snapshots) {
        if (AssignmentProgressCalculator.isCounted(snapshot.status)) practices.push({ assignmentId: classId, studentId, createdAt: snapshot.submittedAt });
      }
    }
    const membersByClass = new Map(classIds.map((classId) => [classId, new Set<string>()]));
    for (const [studentId, classId] of studentClass) membersByClass.get(classId)?.add(studentId);
    return { practices, assignmentClassIds: new Map(classIds.map((classId) => [classId, classId])), membersByClass, now: new Date() };
  }

  static async getFormMeta(): Promise<Backend.ChallengeFormMeta> {
    const settings = await GradingSettingsService.getGradingSettings();
    return { defaultMinAccuracy: settings.minAccuracy, maxSubmissionsDefault: ChallengeConstant.limits.MAX_SUBMISSIONS_DEFAULT };
  }

  static async listReadyPieces(query: Backend.ChallengePieceQuery): Promise<{ items: Backend.ChallengePieceDTO[]; pagination: Backend.PaginationMeta }> {
    const items = await ChallengeRepository.findReadyPieces(query);
    return { items, pagination: { page: 1, limit: items.length, total: items.length } };
  }
}
