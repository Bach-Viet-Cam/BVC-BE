import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassRepository from '../repository/ClassRepository.ts';

// GBR-01 data ownership + GBR-37 read-only finished classes, checked on every class-scoped request.
// A class the lecturer does not own answers 404 so its existence is not leaked.
export default class ClassAccessService {
  static async assertOwnedClass(classId: string, lecturerId: string, options: { requireActive?: boolean } = {}): Promise<Backend.ClassRecord> {
    const classRecord = await ClassRepository.findClassById(classId);
    if (!classRecord || classRecord.ownerId !== lecturerId) throw AppError.notFound(ClassConstant.messages.CLASS_NOT_FOUND);
    if (options.requireActive && classRecord.status === 'ENDED') {
      throw AppError.conflict(ClassConstant.messages.CLASS_FINISHED, { code: 'MSG-08' });
    }
    return classRecord;
  }

  static isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
