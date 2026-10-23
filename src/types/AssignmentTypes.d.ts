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
    id: string;
    classId: string;
    status: AssignmentStatus;
    deletedAt: Date | null;
    publishedAt: Date | null;
    closedAt: Date | null;
    updatedAt: Date;
    class: { id: string; name: string; status: ClassStatus; instrumentId: string; ownerId: string };
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

  interface AssignmentDetailDTO extends AssignmentBaseDTO {
    students: AssignmentStudentDTO[];
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
