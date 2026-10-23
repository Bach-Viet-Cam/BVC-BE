import MemberRepository from '../../classes/repository/MemberRepository.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import AssignmentRepository from '../repository/AssignmentRepository.ts';

// Called by the practice module before it creates a submission for an assignment (spec §4.5).
export default class SubmissionPolicyService {
  static async canSubmit(studentId: string, assignmentId: string): Promise<{ allowed: boolean; reason: string | null }> {
    const denied = { allowed: false, reason: AssignmentConstant.messages.CANNOT_SUBMIT };
    const record = await AssignmentRepository.findById(assignmentId);
    if (!record || record.deletedAt || record.status !== 'PUBLISHED' || record.class.status !== 'ACTIVE') return denied;
    const membership = await MemberRepository.findActiveMembership(record.classId, studentId);
    return membership ? { allowed: true, reason: null } : denied;
  }
}
