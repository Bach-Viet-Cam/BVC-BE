// Builds the per-assignment accuracy series of one student (best score + every attempt) for the stats screens.
export default class StudentStatsCalculator {
  static readonly kindOrder: readonly Backend.AssignmentKind[] = ['SOLO', 'ENSEMBLE', 'BONUS', 'OTHER'];

  static build(assignments: Backend.StatsAssignmentRow[], submissions: Backend.StatsSubmissionRow[]): Backend.StudentStatsAssignmentDTO[] {
    const submissionsByAssignment = new Map<string, Backend.StatsSubmissionRow[]>();
    for (const submission of submissions) {
      const bucket = submissionsByAssignment.get(submission.assignmentId) ?? [];
      bucket.push(submission);
      submissionsByAssignment.set(submission.assignmentId, bucket);
    }

    return [...assignments].sort(StudentStatsCalculator.compareAssignments).map((assignment) => {
      const ordered = [...(submissionsByAssignment.get(assignment.id) ?? [])].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      const scores = ordered.map((submission) => submission.accuracy).filter((accuracy): accuracy is number => accuracy !== null);
      return {
        id: assignment.id,
        title: assignment.title,
        kind: assignment.kind,
        bestAccuracy: scores.length > 0 ? Math.max(...scores) : null,
        attemptCount: ordered.length,
        attempts: ordered.map((submission, index) => ({
          submissionId: submission.id,
          attemptNo: index + 1,
          submittedAt: submission.createdAt.toISOString(),
          status: submission.status,
          accuracy: submission.accuracy,
          hasComment: submission.hasComment
        }))
      };
    });
  }

  private static compareAssignments(left: Backend.StatsAssignmentRow, right: Backend.StatsAssignmentRow): number {
    const kindDelta = StudentStatsCalculator.kindOrder.indexOf(left.kind) - StudentStatsCalculator.kindOrder.indexOf(right.kind);
    if (kindDelta !== 0) return kindDelta;
    // Unpublished dates sort last within the same kind.
    const leftTime = left.publishedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightTime = right.publishedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return leftTime === rightTime ? 0 : leftTime < rightTime ? -1 : 1;
  }
}
