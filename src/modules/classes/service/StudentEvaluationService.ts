import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import MemberRepository from '../repository/MemberRepository.ts';
import StudentStatsRepository from '../repository/StudentStatsRepository.ts';
import ClassAccessService from './ClassAccessService.ts';
import StudentStatsPolicyService from './StudentStatsPolicyService.ts';

const messages = ClassConstant.messages;

// One overall evaluation per (class, student); any lecturer of the class overwrites it and becomes its last editor.
export default class StudentEvaluationService {
  static async save(classId: string, studentId: string, lecturerId: string, content: string): Promise<{ evaluation: Backend.StudentEvaluationDTO; message: string }> {
    const classRecord = await ClassAccessService.assertOwnedClass(classId, lecturerId);
    const membership = await MemberRepository.findActiveMembership(classId, studentId);
    if (!StudentStatsPolicyService.canEvaluate(classRecord.status, membership !== null)) {
      throw AppError.conflict(messages.EVALUATION_LOCKED, { code: 'MSG-08' });
    }
    const saved = await StudentStatsRepository.upsertEvaluation(classId, studentId, lecturerId, content);
    return {
      evaluation: { content: saved.content, lecturerName: saved.lecturer.username, updatedAt: saved.updatedAt.toISOString() },
      message: messages.EVALUATION_SAVED
    };
  }
}
