declare namespace Backend {
  type ChallengeStatus = 'DRAFT' | 'PUBLISHED';
  type ChallengeDisplayStatus = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'ENDED';

  interface ChallengeInput {
    title: string;
    description: string | null;
    instrumentId: string | null;
    pieceId: string | null;
    classIds: string[];
    weekStart: string | null;
    minAccuracy: number | null;
    requiredBpm: number | null;
    maxSubmissions: number;
    publish: boolean;
  }

  // Fields of a PATCH; a missing key keeps the stored value, null clears it.
  interface ChallengePatchInput {
    title?: string;
    description?: string | null;
    instrumentId?: string | null;
    pieceId?: string | null;
    classIds?: string[];
    weekStart?: string | null;
    minAccuracy?: number | null;
    requiredBpm?: number | null;
    maxSubmissions?: number;
  }

  interface ChallengeCreateBody {
    title: string;
    description?: string | null;
    instrumentId?: string | null;
    pieceId?: string | null;
    classIds?: string[];
    weekStart?: string | null;
    minAccuracy?: number | null;
    requiredBpm?: number | null;
    maxSubmissions?: number;
    publish: boolean;
  }

  interface ChallengeListQuery{ page: number; limit: number; }
  interface ChallengePieceQuery { instrumentId?: string; q?: string; }

  interface ChallengeRecord {
    id: string;
    title: string;
    description: string | null;
    status: ChallengeStatus;
    instrumentId: string | null;
    pieceId: string | null;
    sheetMusicId: string | null;
    createdById: string;
    startsAt: Date | null;
    endsAt: Date | null;
    minAccuracy: number | null;
    requiredBpm: number | null;
    maxSubmissions: number;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    instrument: { id: string; name: string } | null;
    piece: { id: string; title: string } | null;
    classes: Array<{ class: { id: string; name: string } }>;
  }

  interface ChallengeDTO {
    id: string;
    title: string;
    description: string | null;
    status: ChallengeStatus;
    displayStatus: ChallengeDisplayStatus;
    instrument: { id: string; name: string } | null;
    piece: { id: string; title: string } | null;
    classes: Array<{ id: string; name: string }>;
    weekStart: string | null;
    startsAt: string | null;
    endsAt: string | null;
    minAccuracy: number | null;
    requiredBpm: number | null;
    maxSubmissions: number;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }

  // One student of the challenge classes; a student in several of them is listed once, under the first class by name
  interface ChallengeStudentDTO extends AssignmentStudentDTO {
    classId: string;
    className: string;
  }

  // Lecturer drawer: configuration plus progress of the counted submissions (Submission.challengeId)
  interface ChallengeDetailDTO extends ChallengeDTO {
    effectiveMinAccuracy: number;
    students: ChallengeStudentDTO[];
    practiceStats: PracticeStatsDTO;
    byClass: ClassPracticeDTO[];
    media: AssignmentMediaDTO | null;
  }

  // Student view: the challenge plus what the student needs to practise it and their own progress
  interface StudentChallengeDTO extends ChallengeDTO {
    sheetMusicId: string | null;
    effectiveMinAccuracy: number;
    usedSubmissions: number;
    bestAccuracy: number | null;
    canPractice: boolean;
  }

  // Detail adds the final standing once the challenge has ended
  interface StudentChallengeDetailDTO extends StudentChallengeDTO {
    rank: number | null;
    participants: number;
  }

  interface StudentChallengeSubmissionDTO {
    id: string;
    attemptNumber: number;
    status: SubmissionStatus;
    accuracy: number | null;
    submittedAt: string;
  }

  interface ChallengePieceDTO { id: string; title: string; composer: string | null; kind: string; bpm: number; }
  interface ChallengeFormMeta { defaultMinAccuracy: number; maxSubmissionsDefault: number; }
}
