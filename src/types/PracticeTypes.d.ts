declare namespace Practice {
  type SubmissionStatus = 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  type Stage = 'QUALITY_CHECK' | 'AUDIO_ANALYSIS' | 'COMPARISON' | 'FEEDBACK';
  type ProgressStatus = 'started' | 'done' | 'failed' | 'rejected';

  interface CreateInput { pieceId: string; sheetMusicId: string; assignmentId?: string; studentUploadId: string; }

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
    referenceAudio: { storageKey: string; status: 'PENDING' | 'READY' } | null;
    instrument: { code: string };
  }

  interface AssignmentGate {
    pieceId: string | null;
    currentVersionId: string | null;
    isPublished: boolean;
    deadline: Date;
    maxSubmissions: number;
    submissions: { status: SubmissionStatus }[];
  }

  interface SubmissionDTO {
    id: string;
    pieceId: string;
    sheetMusicId: string | null;
    assignmentId: string | null;
    status: SubmissionStatus;
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
