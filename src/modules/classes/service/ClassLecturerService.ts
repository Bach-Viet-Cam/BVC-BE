import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassDTO from '../dto/ClassDTO.ts';
import ClassAccessService from './ClassAccessService.ts';
import ClassLecturerRepository from '../repository/ClassLecturerRepository.ts';

const messages = ClassConstant.messages;

export default class ClassLecturerService {
  static async assertAssignableLecturers(lecturerIds: string[], ownerId: string): Promise<void> {
    if (lecturerIds.includes(ownerId)) {
      throw AppError.fieldError(400, { field: 'coLecturerIds', message: messages.LECTURER_IS_OWNER });
    }
    if (lecturerIds.length === 0) return;
    const assignable = await ClassLecturerRepository.findAssignableLecturers(lecturerIds);
    if (assignable.length !== lecturerIds.length) {
      throw AppError.fieldError(400, { field: 'coLecturerIds', message: messages.LECTURER_UNAVAILABLE });
    }
  }

  static async addLecturer(classId: string, ownerId: string, lecturerId: string): Promise<Backend.LecturerDTO> {
    await ClassAccessService.assertPrimaryLecturer(classId, ownerId, { requireActive: true });
    await ClassLecturerService.assertAssignableLecturers([lecturerId], ownerId);
    try {
      const lecturer = await PrismaClientProvider.instance.$transaction(async (transaction) => {
        const created = await ClassLecturerRepository.create(classId, lecturerId, ownerId, transaction);
        await AuditLogger.record({
          actorId: ownerId,
          action: ClassConstant.auditActions.LECTURER_ADD,
          entityType: ClassConstant.auditEntityTypes.CLASS_LECTURER,
          entityId: classId,
          payload: { lecturerId }
        }, transaction);
        return created;
      });
      return ClassDTO.toLecturerDTO(lecturer);
    } catch (error) {
      if (ClassAccessService.isUniqueViolation(error)) throw AppError.conflict(messages.LECTURER_ALREADY_ADDED);
      throw error;
    }
  }

  static async removeLecturer(classId: string, ownerId: string, lecturerId: string): Promise<void> {
    await ClassAccessService.assertPrimaryLecturer(classId, ownerId, { requireActive: true });
    await PrismaClientProvider.instance.$transaction(async (transaction) => {
      const count = await ClassLecturerRepository.deleteByLecturer(classId, lecturerId, transaction);
      if (count === 0) throw AppError.notFound(messages.LECTURER_NOT_IN_CLASS);
      await AuditLogger.record({
        actorId: ownerId,
        action: ClassConstant.auditActions.LECTURER_REMOVE,
        entityType: ClassConstant.auditEntityTypes.CLASS_LECTURER,
        entityId: classId,
        payload: { lecturerId }
      }, transaction);
    });
  }

  static async lookupLecturers(viewerId: string, email: string): Promise<Backend.LecturerDTO[]> {
    const lecturers = await ClassLecturerRepository.searchLecturersByEmail(email, viewerId);
    return lecturers.map(ClassDTO.toLecturerDTO);
  }
}
