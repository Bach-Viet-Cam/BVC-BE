import type { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassModel from '../model/ClassModel.ts';
import ClassRepository from '../repository/ClassRepository.ts';

// GBR-01 data ownership + GBR-37 read-only finished classes, checked on every class-scoped request.
// A class the lecturer neither owns nor co-teaches answers 404 so its existence is not leaked.
export default class ClassAccessService {
  static async assertOwnedClass(classId: string, lecturerId: string, options: { requireActive?: boolean } = {}): Promise<Backend.ClassRecord> {
    const classRecord = await ClassRepository.findClassById(classId);
    if (!classRecord || !ClassAccessService.isClassLecturer(classRecord, lecturerId)) throw AppError.notFound(ClassConstant.messages.CLASS_NOT_FOUND);
    if (options.requireActive && classRecord.status === 'ENDED') {
      throw AppError.conflict(ClassConstant.messages.CLASS_FINISHED, { code: 'MSG-08' });
    }
    return classRecord;
  }

  // Only the primary lecturer manages co-lecturers; a co-lecturer is told so (403), a stranger still gets 404.
  static async assertPrimaryLecturer(classId: string, userId: string, options: { requireActive?: boolean } = {}): Promise<Backend.ClassRecord> {
    const classRecord = await ClassAccessService.assertOwnedClass(classId, userId);
    if (classRecord.ownerId !== userId) throw AppError.forbidden(ClassConstant.messages.LECTURER_MANAGE_FORBIDDEN);
    if (options.requireActive && classRecord.status === 'ENDED') {
      throw AppError.conflict(ClassConstant.messages.CLASS_FINISHED, { code: 'MSG-08' });
    }
    return classRecord;
  }

  static lecturerClassFilter(userId: string): Prisma.ClassWhereInput {
    return ClassModel.lecturerClassFilter(userId);
  }

  static isClassLecturer(classRecord: { ownerId: string; coLecturers: Array<{ lecturerId: string }> }, userId: string): boolean {
    return classRecord.ownerId === userId || classRecord.coLecturers.some((coLecturer) => coLecturer.lecturerId === userId);
  }

  static isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
