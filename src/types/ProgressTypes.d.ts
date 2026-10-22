declare namespace Backend {
  type ProgressStatus = 'ON_TRACK' | 'AT_RISK' | 'BEHIND';

  interface ProgressSubmissionRow {
    assignmentId: string;
    status: SubmissionStatus;
    accuracy: number | null;
  }

  interface WeeklyAverage {
    week: number;
    startDate: string;
    endDate: string;
    average: number | null;
  }
}

declare namespace Backend {
  interface CountedSubmissionRow extends ProgressSubmissionRow {
    studentId: string;
    submittedAt: Date;
  }

  interface ProgressStudentDTO {
    studentId: string;
    fullName: string;
    studentCode: string | null;
    average: number | null;
    status: ProgressStatus | null;
    assignmentsWithSubmissions: number;
    lastSubmittedAt: string | null;
  }

  interface ClassProgressDTO {
    counts: { ON_TRACK: number; AT_RISK: number; BEHIND: number; NO_DATA: number };
    students: ProgressStudentDTO[];
  }

  interface StudentSummaryDTO {
    student: { id: string; fullName: string; studentCode: string | null };
    class: { id: string; name: string; cohort: string; instrument: { id: string; name: string }; startDate: string };
    average: number | null;
    status: ProgressStatus | null;
    minAccuracy: number;
    totalSessions: number;
    sessionsLast7Days: number;
    weekly: WeeklyAverage[];
  }

  interface StudentHistoryItemDTO {
    submissionId: string;
    assignmentId: string;
    assignmentTitle: string;
    kind: AssignmentKind;
    status: SubmissionStatus;
    accuracy: number | null;
    submittedAt: string;
  }

  interface StudentHistoryQuery {
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }
}
