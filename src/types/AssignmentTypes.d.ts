declare namespace Backend {
  type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  type AssignmentKind = 'SOLO' | 'ENSEMBLE' | 'BONUS' | 'OTHER';
  type SubmissionStatus = 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  type StudentAssignmentStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'PASSED';

  interface SubmissionSnapshot {
    status: SubmissionStatus;
    accuracy: number | null;
    submittedAt: Date;
  }

  interface StudentAssignmentSummary {
    status: StudentAssignmentStatus;
    submissionCount: number;
    lastSubmittedAt: Date | null;
    bestAccuracy: number | null;
  }
}

declare namespace Backend {
  interface AssignmentSheetMusicDTO {
    id: string;
    name: string;
    pieceId: string;
    pieceTitle: string;
    defaultBpm: number | null;
    isAvailable: boolean;
  }

  interface AssignmentRecord {
    maxSubmissions?: number | null;
    minAccuracy: number | null;
    createdBy: { id: string; username: string } | null;
    id: string;
    classId: string;
    status: AssignmentStatus;
    deletedAt: Date | null;
    publishedAt: Date | null;
    closedAt: Date | null;
    updatedAt: Date;
    class: { id: string; name: string; cohort: string; status: ClassStatus; instrumentId: string; ownerId: string; coLecturers: Array<{ lecturerId: string }> };
    currentVersion: {
      id: string;
      version: number;
      title: string;
      description: string | null;
      kind: AssignmentKind;
      requiredBpm: number | null;
      sheetMusic: {
        id: string;
        name: string;
        visibility: 'PUBLIC' | 'HIDDEN';
        moderation: 'NORMAL' | 'ADMIN_HIDDEN';
        piece: { id: string; title: string; bpm: number; visibility: 'PUBLIC' | 'HIDDEN'; moderation: 'NORMAL' | 'ADMIN_HIDDEN'; deletedAt: Date | null };
      } | null;
    } | null;
  }

  interface AssignmentContentInput {
    maxSubmissions?: number | null;
    title: string;
    description?: string | null;
    kind: AssignmentKind;
    sheetMusicId?: string | null;
    requiredBpm?: number | null;
  }

  interface CreateAssignmentInput extends AssignmentContentInput {
    classId: string;
    publish: boolean;
  }

  interface AssignmentBaseDTO {
    maxSubmissions: number | null;
    id: string;
    classId: string;
    className: string;
    classStatus: ClassStatus;
    status: AssignmentStatus;
    version: number;
    title: string;
    description: string | null;
    kind: AssignmentKind;
    sheetMusic: AssignmentSheetMusicDTO | null;
    requiredBpm: number | null;
    effectiveBpm: number | null;
    publishedAt: string | null;
    closedAt: string | null;
    updatedAt: string;
  }
}

declare namespace Backend {
  interface AssignmentListQuery {
    classId?: string;
    kind?: AssignmentKind;
    status?: AssignmentStatus;
    q?: string;
    page: number;
    limit: number;
  }

  interface AssignmentListItemDTO {
    id: string;
    classId: string;
    className: string;
    status: AssignmentStatus;
    version: number;
    title: string;
    kind: AssignmentKind;
    submittedCount: number;
    memberCount: number;
    updatedAt: string;
  }

  interface AssignmentStudentDTO {
    studentId: string;
    fullName: string;
    studentCode: string | null;
    status: StudentAssignmentStatus;
    submissionCount: number;
    lastSubmittedAt: string | null;
    bestAccuracy: number | null;
  }

  interface MediaFileDTO {
    url: string | null;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    durationSec: number | null;
    pageCount: number | null;
  }

  interface AssignmentMediaDTO {
    sheet: MediaFileDTO | null;
    referenceAudio: MediaFileDTO | null;
    tutorialVideo: MediaFileDTO | null;
  }

  interface AssignmentSheetMediaRecord {
    sheetFile: MusicLibrary.MediaFileRecord;
    referenceAudio: MusicLibrary.MediaFileRecord | null;
    tutorialVideo: MusicLibrary.MediaFileRecord | null;
  }

  interface AssignmentDetailDTO extends AssignmentBaseDTO {
    students: AssignmentStudentDTO[];
    practiceStats: PracticeStatsDTO;
    minAccuracy: number;
    createdBy: { id: string; fullName: string } | null;
    media: AssignmentMediaDTO | null;
  }

  interface SubmissionCommentDTO {
    content: string;
    updatedAt: string;
  }

  interface StudentSubmissionDTO {
    id: string;
    attemptNumber: number;
    version: number;
    status: SubmissionStatus;
    accuracy: number | null;
    tempoDeviation: number | null;
    audioUrl: string;
    submittedAt: string;
    comment: SubmissionCommentDTO | null;
  }

  interface StudentSubmissionsDTO {
    student: { id: string; fullName: string; studentCode: string | null };
    canComment: boolean;
    submissions: StudentSubmissionDTO[];
  }

  interface ClassSheetMusicDTO {
    id: string;
    name: string;
    pieceId: string;
    pieceTitle: string;
    kind: PieceKind;
    defaultBpm: number | null;
  }
}

declare namespace Backend {
  type OverviewEmptyReason = 'NO_SEMESTER_CONFIGURED' | 'NO_CURRENT_SEMESTER' | 'NO_CLASSES_IN_SEMESTER';

  interface OverviewAssignmentDTO {
    id: string;
    classId: string;
    title: string;
    kind: AssignmentKind;
    status: AssignmentStatus;
    version: number;
    sheetMusicId: string | null;
    sheetTitle: string | null;
    practiceCount: number;
    submittedCount: number;
    memberCount: number;
    updatedAt: string;
  }

  interface OverviewClassDTO {
    id: string;
    name: string;
    status: ClassStatus;
    memberCount: number;
    assignments: OverviewAssignmentDTO[];
  }

  interface OverviewSheetStatDTO {
    sheetMusicId: string;
    practicedStudents: number;
    memberCount: number;
    practiceCount: number;
  }

  interface AssignmentOverviewDTO {
    semester: Semester | null;
    emptyReason: OverviewEmptyReason | null;
    classes: OverviewClassDTO[];
    sheetStats: OverviewSheetStatDTO[];
  }

  interface SheetGroupAssignmentDTO extends OverviewAssignmentDTO {
    className: string;
    maxSubmissions: number | null;
    effectiveBpm: number | null;
    minAccuracy: number;
    publishedAt: string | null;
    createdBy: { id: string; fullName: string } | null;
  }

  interface SheetGroupDetailDTO {
    semester: Semester;
    sheetMusic: AssignmentSheetMusicDTO;
    media: AssignmentMediaDTO;
    assignments: SheetGroupAssignmentDTO[];
    practiceStats: PracticeStatsDTO;
    byClass: ClassPracticeDTO[];
  }

  interface ClassWithAssignmentsRecord {
    id: string;
    name: string;
    status: ClassStatus;
    assignments: AssignmentRecord[];
  }
}

declare namespace Backend {
  type AssignSkipReason = 'NOT_CLASS_LECTURER' | 'NOT_CURRENT_SEMESTER' | 'CLASS_NOT_ACTIVE' | 'SHEET_UNAVAILABLE' | 'ALREADY_ASSIGNED' | 'KIND_SLOT_TAKEN';

  interface AssignPlanSource {
    id: string;
    cohort: string;
    title: string;
    kind: AssignmentKind;
    sheetMusicId: string | null;
  }

  interface AssignPlanTarget {
    id: string;
    cohort: string;
    status: ClassStatus;
    instrumentId: string;
    isLecturer: boolean;
    existing: Array<{ title: string; kind: AssignmentKind; sheetMusicId: string | null }>;
  }

  interface AssignPlan {
    toCreate: Array<{ sourceId: string; classId: string }>;
    skipped: Array<{ assignmentId: string; classId: string; reason: AssignSkipReason }>;
  }
}

declare namespace Backend {
  interface AssignResultDTO {
    created: AssignmentBaseDTO[];
    skipped: AssignPlan['skipped'];
  }
}

declare namespace Backend {
  interface CountedPractice {
    assignmentId: string;
    studentId: string;
    createdAt: Date;
  }

  interface PracticeStatsDTO {
    totalPractices: number;
    practicedStudents: number;
    memberCount: number;
    averagePerStudent: number;
    last7Days: DailyCount[];
  }

  interface ClassPracticeDTO {
    classId: string;
    className: string;
    practicedStudents: number;
    memberCount: number;
  }

  interface PracticeStatsInput {
    practices: CountedPractice[];
    assignmentClassIds: Map<string, string>;
    membersByClass: Map<string, Set<string>>;
    now: Date;
  }
}
