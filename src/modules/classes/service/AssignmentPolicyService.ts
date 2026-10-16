export type SubmissionStatusValue = 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
export type StudentAssignmentStatus = 'PASSED' | 'SUBMITTED' | 'OVERDUE' | 'NOT_SUBMITTED';

export default class AssignmentPolicyService {
  static isCounted(status: SubmissionStatusValue): boolean {
    return status !== 'REJECTED' && status !== 'FAILED';
  }

  static countUsedSubmissions(submissions: { status: SubmissionStatusValue }[]): number {
    return submissions.filter((submission) => AssignmentPolicyService.isCounted(submission.status)).length;
  }

  static getStudentStatus(input: { deadline: Date; now: Date; minAccuracy: number; submissions: { status: SubmissionStatusValue; accuracy: number | null }[] }): StudentAssignmentStatus {
    const counted = input.submissions.filter((submission) => AssignmentPolicyService.isCounted(submission.status));
    const hasPassed = counted.some((submission) => submission.status === 'COMPLETED' && submission.accuracy !== null && submission.accuracy >= input.minAccuracy);
    if (hasPassed) return 'PASSED';
    if (counted.length > 0) return 'SUBMITTED';
    return input.deadline.getTime() < input.now.getTime() ? 'OVERDUE' : 'NOT_SUBMITTED';
  }

  static canSubmit(input: { isPublished: boolean; deadline: Date; now: Date; maxSubmissions: number; submissions: { status: SubmissionStatusValue }[] }): boolean {
    if (!input.isPublished || input.deadline.getTime() < input.now.getTime()) return false;
    return AssignmentPolicyService.countUsedSubmissions(input.submissions) < input.maxSubmissions;
  }
}
