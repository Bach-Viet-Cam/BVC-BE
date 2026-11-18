declare namespace Backend {
  interface StatsAssignmentRow {
    id: string;
    title: string;
    kind: AssignmentKind;
    publishedAt: Date | null;
  }

  interface StatsSubmissionRow {
    id: string;
    assignmentId: string;
    status: SubmissionStatus;
    accuracy: number | null;
    createdAt: Date;
    hasComment: boolean;
  }

  interface StudentStatsAttemptDTO {
    submissionId: string;
    attemptNo: number;
    submittedAt: string;
    status: SubmissionStatus;
    accuracy: number | null;
    hasComment: boolean;
  }

  interface StudentStatsAssignmentDTO {
    id: string;
    title: string;
    kind: AssignmentKind;
    bestAccuracy: number | null;
    attemptCount: number;
    attempts: StudentStatsAttemptDTO[];
  }

  interface StudentStatsClassDTO {
    id: string;
    name: string;
    cohort: string;
    status: ClassStatus;
  }

  interface StudentEvaluationDTO {
    content: string;
    lecturerName: string;
    updatedAt: string;
  }

  interface StudentStatsDTO {
    student: { id: string; fullName: string; studentCode: string | null };
    class: StudentStatsClassDTO;
    evaluation: StudentEvaluationDTO | null;
    canEvaluate: boolean;
    classes?: StudentStatsClassDTO[];
    assignments: StudentStatsAssignmentDTO[];
  }
}
