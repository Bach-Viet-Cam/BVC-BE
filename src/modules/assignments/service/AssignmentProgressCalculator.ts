import AssignmentConstant from '../constant/AssignmentConstant.ts';

// Per-student status for one assignment (spec §4.3), computed on read so a change of the
// admin threshold applies immediately.
export default class AssignmentProgressCalculator {
  static isCounted(status: Backend.SubmissionStatus): boolean {
    return !AssignmentConstant.uncountedSubmissionStatuses.includes(status);
  }

  static summarize(submissions: Backend.SubmissionSnapshot[], minAccuracy: number): Backend.StudentAssignmentSummary {
    const counted = submissions.filter((submission) => AssignmentProgressCalculator.isCounted(submission.status));
    const accuracies = counted
      .filter((submission) => submission.status === 'COMPLETED' && submission.accuracy !== null)
      .map((submission) => submission.accuracy as number);
    const bestAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : null;
    const lastSubmittedAt = counted.reduce<Date | null>(
      (latest, submission) => (!latest || submission.submittedAt > latest ? submission.submittedAt : latest),
      null
    );

    let status: Backend.StudentAssignmentStatus = 'NOT_SUBMITTED';
    if (bestAccuracy !== null && bestAccuracy >= minAccuracy) status = 'PASSED';
    else if (counted.length > 0) status = 'SUBMITTED';
    return { status, submissionCount: counted.length, lastSubmittedAt, bestAccuracy };
  }
}
