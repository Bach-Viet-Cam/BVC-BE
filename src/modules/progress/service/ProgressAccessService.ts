import AppError from '../../../utils/AppError.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import ClassConstant from '../../classes/constant/ClassConstant.ts';
import ClassRepository from '../../classes/repository/ClassRepository.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import ProgressConstant from '../constant/ProgressConstant.ts';
import ProgressRepository from '../repository/ProgressRepository.ts';

// Lecturer: own class, any member or former member with submissions. Student: only themself while a member.
export default class ProgressAccessService {
  static async assertCanViewStudent(
    classId: string,
    studentId: string,
    viewer: Backend.UserDTO
  ): Promise<{ classRecord: Backend.ClassRecord; student: { id: string; username: string; studentCode: string | null } }> {
    const notFound = AppError.notFound(ProgressConstant.messages.STUDENT_NOT_FOUND);
    if (viewer.role === AuthConstant.roles.TEACHER) {
      const classRecord = await ClassAccessService.assertOwnedClass(classId, viewer.userId);
      const [student, membership, hasSubmission] = await Promise.all([
        ProgressRepository.findStudent(studentId),
        MemberRepository.findActiveMembership(classId, studentId),
        ProgressRepository.hasAnySubmission(classId, studentId)
      ]);
      if (!student || (!membership && !hasSubmission)) throw notFound;
      return { classRecord, student };
    }

    if (viewer.userId !== studentId) throw notFound;
    const [classRecord, membership, student] = await Promise.all([
      ClassRepository.findClassById(classId),
      MemberRepository.findActiveMembership(classId, studentId),
      ProgressRepository.findStudent(studentId)
    ]);
    if (!classRecord || !membership || !student) throw AppError.notFound(ClassConstant.messages.CLASS_NOT_FOUND);
    return { classRecord, student };
  }
}
