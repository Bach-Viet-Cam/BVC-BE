declare namespace Practice {
  type SubmissionStatus = 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  type Stage = 'QUALITY_CHECK' | 'AUDIO_ANALYSIS' | 'COMPARISON' | 'FEEDBACK';
  type ProgressStatus = 'started' | 'done' | 'failed' | 'rejected';
  type PracticeMode = 'SOLO' | 'ENSEMBLE';

  interface CreateInput { sheetMusicId: string; assignmentId?: string; studentUploadId: string; practiceMode?: PracticeMode; }

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
    // Template analysis of the reference audio (MAIN sheets only); analysisJobId is the Rhythm analysis id
    analysisStatus: 'NONE' | 'PROCESSING' | 'READY' | 'ERROR';
    analysisJobId: string | null;
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
    memberInstrumentId: string;
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
      // Reference recording to listen to before recording; isFallback: the sheet has none, so the MAIN sheet's is used
      referenceAudio: { url: string; isFallback: boolean } | null;
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

  // SCR-01 history: PRACTICE = free practice, SOLO = class assignment, BONUS = bonus assignment, ENSEMBLE = hòa tấu
  type HistoryKind = 'PRACTICE' | 'BONUS' | 'SOLO' | 'ENSEMBLE';
  type HistoryAccuracyRange = 'ABOVE_90' | '70_90' | '50_70' | 'BELOW_50';

  // Days are yyyy-MM-dd Vietnam calendar days, both ends inclusive
  interface HistoryQuery {
    pieceIds: string[];
    fromDate?: string;
    toDate?: string;
    accuracyRanges: HistoryAccuracyRange[];
    minAccuracy?: number;
    maxAccuracy?: number;
    title?: string;
    kinds: HistoryKind[];
    page: number;
    limit: number;
  }

  interface HistoryFilter extends Omit<HistoryQuery, 'fromDate' | 'toDate' | 'page' | 'limit'> {
    from?: Date;
    to?: Date;
  }

  interface HistoryRecord {
    id: string;
    pieceId: string;
    sheetMusicId: string | null;
    assignmentId: string | null;
    status: SubmissionStatus;
    practiceMode: PracticeMode;
    accuracy: number | null;
    createdAt: Date;
    piece: { title: string };
    assignment: { type: string } | null;
  }

  interface HistoryItemDTO {
    id: string;
    pieceId: string;
    pieceTitle: string;
    sheetMusicId: string | null;
    assignmentId: string | null;
    status: SubmissionStatus;
    kind: HistoryKind;
    accuracy: number | null;
    submittedAt: string;
  }

  // Unfiltered counts of the student's submissions, for the header summary and the compare button
  interface HistoryOverall {
    total: number;
    completed: number;
    processing: number;
    rejected: number;
    failed: number;
  }

  interface HistoryDTO {
    items: HistoryItemDTO[];
    pagination: Backend.PaginationMeta;
    overall: HistoryOverall;
  }

  interface HistoryPieceOptionDTO { id: string; title: string; }

  // Record screen settings ----------------------------------------------------------------------------

  // ASSIGNMENT: the class assignment of this sheet sets the tempo; DEFAULT: fallback (no class, not assigned, no BPM)
  interface TargetBpmDTO {
    targetBpm: number;
    source: 'ASSIGNMENT' | 'DEFAULT';
    assignmentId: string | null;
  }

  interface InstrumentTuneRow { id: string; tuneName: string; pitch: number; displayOrder: number; }

  // Standard pitch of each string of the sheet's instrument (instrument_tunes), for the string tuner
  interface InstrumentTunesDTO {
    instrument: { id: string; name: string };
    tunes: { id: string; name: string; pitchHz: number; displayOrder: number }[];
  }

  // M01 results screen ------------------------------------------------------------------------------

  // Submission row with everything the results screen reads
  interface ResultRecord {
    id: string;
    studentId: string;
    pieceId: string;
    sheetMusicId: string | null;
    assignmentId: string | null;
    status: SubmissionStatus;
    accuracy: number | null;
    result: unknown;
    aiFeedback: string | null;
    pitchChart: unknown;
    evaluationId: string | null;
    fileDeletedAt: Date | null;
    analyzedAt: Date | null;
    createdAt: Date;
    piece: { id: string; title: string };
    sheetMusic: { id: string; name: string; referenceAudio: { storageKey: string; status: string } | null } | null;
    assignment: { id: string; title: string; classId: string; class: { name: string } } | null;
    studentUpload: { url: string; deletingAt: Date | null } | null;
  }

  // Submission.result narrowed to the fields the screen uses; missing fields fall back to empty values
  interface AnalysisResult {
    overallScore: number;
    pitchAccuracyPercent: number;
    rhythmAccuracyPercent: number;
    teacherTempoBpm: number | null;
    studentTempoBpm: number | null;
    aiFeedback: string;
    rhythmSegments: { startTime: number; endTime: number; status: RhythmIssueStatus }[];
    pitchErrorSegments: { startTime: number; endTime: number; averageCentsDifference: number }[];
    durationSec: number | null;
    warnings: { code: string; message: string }[];
  }

  type IssueKind = 'pitch' | 'rhythm';
  type RhythmIssueStatus = 'fast' | 'slow' | 'missing';

  interface ResultIssueDTO {
    id: string;
    kind: IssueKind;
    startSec: number;
    endSec: number;
    rhythmStatus: RhythmIssueStatus | null;
    centsDifference: number | null;
    label: string;
  }

  interface ResultDTO {
    submission: { id: string; status: SubmissionStatus; submittedAt: string; analyzedAt: string | null; attemptNo: number };
    piece: { id: string; title: string };
    sheetMusic: { id: string; name: string } | null;
    assignment: { id: string; title: string; classId: string } | null;
    recording: { durationSec: number | null };
    scores: { overall: number; pitch: number; rhythm: number; tempo: number | null } | null;
    tempo: { teacherBpm: number | null; studentBpm: number | null; deviationPercent: number | null } | null;
    aiFeedback: { text: string; isFallback: boolean } | null;
    issues: ResultIssueDTO[];
    qualityWarnings: { code: string; message: string }[];
    audio: { teacherUrl: string | null; studentUrl: string | null };
  }

  interface AttemptRecord { id: string; accuracy: number | null; createdAt: Date; }

  interface AttemptDTO { submissionId: string; attemptNo: number; accuracyPercent: number; submittedAt: string; isCurrent: boolean; }

  interface ResultHistoryDTO {
    pieceTitle: string;
    isFirstAttempt: boolean;
    deltaPercent: number | null;
    bestPercent: number;
    attempts: AttemptDTO[];
  }

  // hasEnoughPeers = false: fewer than minPeers classmates have a result, so only myScore is filled (GBR-53)
  interface ClassRankDTO {
    className: string;
    peerCount: number;
    minPeers: number;
    hasEnoughPeers: boolean;
    myScore: number;
    classAverage: number | null;
    betterThanPercent: number | null;
    topPercent: number | null;
    distribution: { score: number; count: number }[];
  }

  // [teacherSec, teacherHz, studentHz]; null = unvoiced (no pitch) at that point
  type PitchPoint = [number, number | null, number | null];

  interface PitchChartDTO {
    durationSec: number;
    minHz: number;
    maxHz: number;
    points: PitchPoint[];
    segments: { id: string; kind: IssueKind; startSec: number; endSec: number; label: string }[];
    // [teacherSec, studentSec] pairs: where the same musical moment sits in each recording, for audio seek
    timeMap: [number, number][];
  }

  // Rhythm evaluation analysis file (schemaVersion 1)
  interface AnalysisFile {
    sampleRate: number;
    hopLength: number;
    teacherF0Hz: (number | null)[];
    studentF0Hz: (number | null)[];
    studentFrameByTeacherFrame: number[];
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
