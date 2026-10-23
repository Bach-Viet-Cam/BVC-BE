declare namespace Backend {
  type LeaderboardCriterion = 'streak' | 'accuracy' | 'bonus' | 'completion';
  type LeaderboardCategoryKey = 'overall' | 'accuracy' | 'improvement' | 'streak' | 'activity';
  type LeaderboardCategoryEnum = 'OVERALL' | 'ACCURACY' | 'IMPROVEMENT' | 'STREAK' | 'ACTIVITY';
  type EnsembleSessionStatus = 'RECORDING' | 'COMPLETED' | 'FAILED';

  interface LeaderboardSubmission {
    assignmentId: string;
    kind: AssignmentKind;
    // Published or closed, not deleted, not Bonus (P1): only these feed accuracy, improvement and completion
    isCounted: boolean;
    status: SubmissionStatus;
    accuracy: number | null;
    submittedAt: Date;
  }

  interface LeaderboardEnsembleSession {
    status: EnsembleSessionStatus;
    createdAt: Date;
  }

  interface LeaderboardBonusAssignment {
    id: string;
    bonusPoints: number | null;
  }

  // Everything one student did in the semester, grouped by the snapshot service
  interface LeaderboardActivity {
    submissions: LeaderboardSubmission[];
    ensembleSessions: LeaderboardEnsembleSession[];
    assignmentIds: string[];
    bonusAssignments: LeaderboardBonusAssignment[];
  }

  // Source rows read by LeaderboardSourceRepository
  interface LeaderboardMemberRecord {
    studentId: string;
    username: string;
    studentCode: string | null;
    classId: string;
    className: string;
  }

  interface LeaderboardSubmissionRecord {
    studentId: string;
    classId: string;
    assignmentId: string;
    kind: AssignmentKind;
    assignmentStatus: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    status: SubmissionStatus;
    accuracy: number | null;
    submittedAt: Date;
  }

  interface LeaderboardEnsembleRecord {
    studentId: string;
    classId: string | null;
    status: EnsembleSessionStatus;
    createdAt: Date;
  }

  interface LeaderboardAssignmentRecord {
    id: string;
    classId: string;
    bonusPoints: number | null;
  }

  interface LeaderboardSnapshotHeader {
    semester: string;
    periodStart: string;
    periodEnd: string;
    weekStart: string;
    snapshotDate: string;
    startedAt: Date;
    generatedAt: Date;
    durationMs: number;
  }

  interface LeaderboardEntryInput {
    category: LeaderboardCategoryEnum;
    studentId: string;
    classId: string;
    rank: number;
    position: number;
    value: number;
    criteria: Record<string, unknown> | null;
  }

  interface LeaderboardSnapshotRecord {
    id: string;
    semester: string;
    snapshotDate: string;
    generatedAt: Date;
  }

  interface LeaderboardEntryRecord {
    studentId: string;
    fullName: string;
    className: string;
    rank: number;
    position: number;
    value: number;
  }

  interface LeaderboardQuery {
    category: LeaderboardCategoryKey;
    page: number;
    limit: number;
    semester?: string;
  }

  interface LeaderboardRowDTO {
    rank: number;
    studentId: string;
    fullName: string;
    className: string;
    value: number;
  }

  type LeaderboardMeDTO =
    | { status: 'RANKED'; rank: number; value: number }
    | { status: 'NO_ACTIVITY' }
    | { status: 'NOT_IN_CATEGORY'; reason: 'NO_DATA' | 'NO_PREVIOUS_WEEK' };

  interface LeaderboardCurrentDTO {
    semester: { name: string; label: string } | null;
    generatedAt: string | null;
    totalRanked: number;
    categoryTotal: number;
    me: LeaderboardMeDTO | null;
    top3: LeaderboardRowDTO[];
    items: LeaderboardRowDTO[];
    pagination: { page: number; limit: number; total: number };
  }

  interface LeaderboardBuildResult {
    semester: string;
    snapshotId: string;
    generatedAt: Date;
    rowCount: number;
    durationMs: number;
  }

  // One ranked student with every metric of the semester
  interface LeaderboardStudentMetrics {
    studentId: string;
    studentCode: string | null;
    classId: string;
    longestStreak: number;
    currentStreak: number;
    accuracy: number | null;
    improvement: number | null;
    weeklyActivity: number;
    bonus: number;
    completion: number;
  }

  interface LeaderboardCriteriaRow {
    studentId: string;
    // Raw value per criterion; null when the student has no data for it
    criteria: Record<LeaderboardCriterion, number | null>;
  }

  interface LeaderboardOverallScore {
    studentId: string;
    score: number;
    normalized: Record<LeaderboardCriterion, number>;
  }

  interface LeaderboardRankInput {
    studentId: string;
    studentCode: string | null;
    value: number;
  }

  interface LeaderboardRanked extends LeaderboardRankInput {
    rank: number;
    position: number;
  }
}
