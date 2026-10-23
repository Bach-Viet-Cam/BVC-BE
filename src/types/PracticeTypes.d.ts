declare namespace Practice {
  type SubmissionStatus = 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  type Stage = 'QUALITY_CHECK' | 'AUDIO_ANALYSIS' | 'COMPARISON' | 'FEEDBACK';
  type ProgressStatus = 'started' | 'done' | 'failed' | 'rejected';
  type PracticeMode = 'SOLO' | 'ENSEMBLE';

  interface CreateInput { pieceId: string; sheetMusicId: string; assignmentId?: string; studentUploadId: string; practiceMode?: PracticeMode; }

  // Body the Rhythm service posts for every job event (see its ProgressCallback schema)
  interface ProgressCallback {
    evaluationId: string;
    attempt: number;
    job: Audio.JobCode;
    status: ProgressStatus;
    code?: string | null;
    reason?: string | null;
    result?: Audio.Result | null;
  }

  interface SubmissionRecord {
    id: string;
    studentId: string;
    pieceId: string;
    sheetMusicId: string | null;
    assignmentId: string | null;
    status: SubmissionStatus;
    practiceMode: PracticeMode;
    stage: Stage | null;
    stageStartedAt: Date | null;
    attempt: number;
    retryCount: number;
    retryAvailableAt: Date | null;
    fileDeletedAt: Date | null;
    fileUrl: string | null;
    evaluationId: string | null;
    messageId: string | null;
    publicationState: string | null;
    rejectReason: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    analyzedAt: Date | null;
    createdAt: Date;
    studentUpload: { id: string; key: string } | null;
  }

  interface SubmissionCreateData {
    studentId: string;
    pieceId: string;
    sheetMusicId: string;
    assignmentId: string | null;
    assignmentVersionId: string | null;
    studentUploadId: string;
    fileUrl: string;
    evaluationId: string;
    messageId: string;
    practiceMode: PracticeMode;
  }

  interface SubmissionUpdate {
    status?: SubmissionStatus;
    stage?: Stage;
    stageStartedAt?: Date;
    attempt?: number;
    retryCount?: number;
    retryAvailableAt?: Date | null;
    publicationState?: string;
    messageId?: string;
    accuracy?: number | null;
    tempoDeviation?: number | null;
    result?: Audio.Result;
    aiFeedback?: string | null;
    rejectReason?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    analyzedAt?: Date;
  }

  interface SheetTemplate {
    id: string;
    pieceId: string;
    instrumentId: string;
    kind: 'MAIN' | 'LEVEL';
    referenceAudio: { storageKey: string; status: 'PENDING' | 'READY' } | null;
    instrument: { code: string };
  }

  // Sheet shown on the record screen, with the piece it belongs to
  interface ContextSheet extends Omit<SheetTemplate, 'instrument'> {
    name: string;
    durationSec: number | null;
    analysisFileUrl: string | null;
    instrument: { id: string; code: string; name: string };
    level: { id: string; name: string };
    piece: { id: string; title: string; bpm: number };
  }

  interface AssignmentCandidate {
    id: string;
    title: string;
    description: string;
    status: Backend.AssignmentStatus;
    deadline: Date;
    maxSubmissions: number;
    targetBpm: number | null;
    currentVersionId: string | null;
    currentVersion: { kind: Backend.AssignmentKind } | null;
    submissions: { status: SubmissionStatus }[];
  }

  // The student's current class with its assignments for one piece
  interface ClassAssignments {
    classRecord: { id: string; name: string; status: Backend.ClassStatus; instrumentId: string };
    assignments: AssignmentCandidate[];
  }

  // OPEN counts toward the assignment; ENDED = past deadline, class ended or assignment closed
  type AssignmentState = 'OPEN' | 'ENDED' | 'EXHAUSTED';

  interface ResolvedAssignment {
    candidate: AssignmentCandidate;
    state: AssignmentState;
    usedSubmissions: number;
  }

  interface ContextDTO {
    piece: { id: string; title: string };
    sheet: {
      id: string;
      name: string;
      isMain: boolean;
      durationSec: number | null;
      instrument: { id: string; name: string };
      level: { id: string; name: string };
      practice: { isAvailable: boolean; reason: string | null };
    };
    enrollment: 'NO_CLASS' | 'IN_CLASS';
    classRecord: { id: string; name: string } | null;
    assignment: {
      id: string;
      title: string;
      description: string;
      deadline: string;
      maxSubmissions: number;
      usedSubmissions: number;
      remainingSubmissions: number;
      targetBpm: number | null;
      state: AssignmentState;
      countsTowardAssignment: boolean;
    } | null;
  }

  interface SubmissionDTO {
    id: string;
    pieceId: string;
    sheetMusicId: string | null;
    assignmentId: string | null;
    status: SubmissionStatus;
    practiceMode: PracticeMode;
    stage: Stage | null;
    stageStartedAt: string | null;
    retryCount: number;
    maxRetries: number;
    retryAvailableAt: string | null;
    isFileDeleted: boolean;
    rejectReason: string | null;
    errorMessage: string | null;
    analyzedAt: string | null;
    submittedAt: string;
  }
}
