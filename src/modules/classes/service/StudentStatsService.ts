import AppError from '../../../utils/AppError.ts';
import SubmissionRepository from '../../assignments/repository/SubmissionRepository.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import MemberRepository from '../repository/MemberRepository.ts';
import StudentStatsRepository from '../repository/StudentStatsRepository.ts';
import ClassAccessService from './ClassAccessService.ts';
import StudentStatsCalculator from './StudentStatsCalculator.ts';
import StudentStatsPolicyService from './StudentStatsPolicyService.ts';

const messages = ClassConstant.messages;

// Student stats: best accuracy + every attempt per assignment, plus the lecturer's overall evaluation.
export default class StudentStatsService {
  static async getForLecturer(classId: string, studentId: string, lecturerId: string): Promise<Backend.StudentStatsDTO> {
    const classRecord = await ClassAccessService.assertOwnedClass(classId, lecturerId);
    const [profile, membership, wasMember] = await Promise.all([
      SubmissionRepository.findStudentProfile(studentId),
      MemberRepository.findActiveMembership(classId, studentId),
      StudentStatsRepository.hasEverBeenMember(classId, studentId)
    ]);
    if (!profile || !wasMember) throw AppError.notFound(messages.STUDENT_NOT_FOUND);

    const classInfo = { id: classRecord.id, name: classRecord.name, cohort: classRecord.cohort, status: classRecord.status };
    return {
      ...(await StudentStatsService.loadStats(classInfo, profile)),
      canEvaluate: StudentStatsPolicyService.canEvaluate(classRecord.status, membership !== null)
    };
  }

  // null = the student has never been in a class.
  static async getForStudent(studentId: string, classId?: string): Promise<Backend.StudentStatsDTO | null> {
    const classes = await StudentStatsRepository.findStudentClasses(studentId);
    const selectedId = classId ?? StudentStatsPolicyService.pickDefaultClass(classes);
    if (!selectedId) return null;
    const selected = classes.find((classItem) => classItem.id === selectedId);
    if (!selected) throw AppError.notFound(messages.CLASS_NOT_FOUND);
    const profile = await SubmissionRepository.findStudentProfile(studentId);
    if (!profile) throw AppError.notFound(messages.STUDENT_NOT_FOUND);

    const toClass = (classItem: Backend.StudentStatsClassDTO): Backend.StudentStatsClassDTO => ({
      id: classItem.id,
      name: classItem.name,
      cohort: classItem.cohort,
      status: classItem.status
    });
    const newestFirst = [...classes].sort((left, right) => right.startDate.getTime() - left.startDate.getTime());
    return {
      ...(await StudentStatsService.loadStats(toClass(selected), profile)),
      canEvaluate: false,
      classes: newestFirst.map(toClass)
    };
  }

  private static async loadStats(
    classInfo: Backend.StudentStatsClassDTO,
    profile: { id: string; username: string; studentCode: string | null }
  ): Promise<Omit<Backend.StudentStatsDTO, 'canEvaluate'>> {
    const assignments = await StudentStatsRepository.findStatsAssignments(classInfo.id);
    const [submissions, evaluation] = await Promise.all([
      StudentStatsRepository.findStatsSubmissions(profile.id, assignments.map((assignment) => assignment.id)),
      StudentStatsRepository.findEvaluation(classInfo.id, profile.id)
    ]);
    return {
      student: { id: profile.id, fullName: profile.username, studentCode: profile.studentCode },
      class: classInfo,
      evaluation: evaluation
        ? { content: evaluation.content, lecturerName: evaluation.lecturer.username, updatedAt: evaluation.updatedAt.toISOString() }
        : null,
      assignments: StudentStatsCalculator.build(assignments, submissions)
    };
  }
}
