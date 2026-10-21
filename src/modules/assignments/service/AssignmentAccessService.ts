import AppError from '../../../utils/AppError.ts';
import ClassConstant from '../../classes/constant/ClassConstant.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import AssignmentRepository from '../repository/AssignmentRepository.ts';

// Ownership (GBR-01) + soft delete + read-only finished class (GBR-37 / A17) for every assignment request.
export default class AssignmentAccessService {
  static async assertOwnedAssignment(assignmentId: string, lecturerId: string, options: { requireActiveClass?: boolean } = {}): Promise<Backend.AssignmentRecord> {
    const record = await AssignmentRepository.findById(assignmentId);
    if (!record || record.deletedAt || record.class.ownerId !== lecturerId) {
      throw AppError.notFound(AssignmentConstant.messages.ASSIGNMENT_NOT_FOUND);
    }
    if (options.requireActiveClass && record.class.status === 'ENDED') {
      throw AppError.conflict(ClassConstant.messages.CLASS_FINISHED, { code: 'MSG-08' });
    }
    return record;
  }
}
