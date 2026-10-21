declare namespace Backend {
  type ClassStatus = 'ACTIVE' | 'ENDED';
  type ClassStatusFilter = ClassStatus | 'ALL';
  type AccountStatusFilter = 'ALL' | 'ACTIVE' | 'PENDING';
  type ImportLogStatus = 'PREVIEW' | 'CONFIRMED' | 'CANCELLED';
  type ImportFileType = 'xlsx' | 'csv';
  type StudentRowField = 'studentCode' | 'fullName' | 'email';

  interface ClassRecord {
    id: string;
    name: string;
    cohort: string;
    description: string | null;
    instrumentId: string;
    ownerId: string;
    startDate: Date;
    endDate: Date;
    status: ClassStatus;
    endedAt: Date | null;
    roadmapId: string | null;
    createdAt: Date;
    instrument: { id: string; name: string };
    _count: { members: number };
  }

  interface ClassSummaryDTO {
    id: string;
    name: string;
    cohort: string;
    status: ClassStatus;
    instrument: { id: string; name: string };
    startDate: string;
    endDate: string;
    memberCount: number;
  }

  interface ClassDetailDTO extends ClassSummaryDTO {
    description: string | null;
    hasStarted: boolean;
    isReadOnly: boolean;
    endedAt: string | null;
  }

  interface ClassListQuery {
    q?: string;
    cohort?: string;
    instrumentId?: string;
    status: ClassStatusFilter;
    page: number;
    limit: number;
  }

  interface ClassListResult {
    items: ClassSummaryDTO[];
    pagination: PaginationMeta;
    activeCount: number;
    cohorts: string[];
  }

  interface CreateClassInput {
    name: string;
    cohort: string;
    instrumentId: string;
    description?: string | null;
    startDate: string;
  }

  type UpdateClassInput = Partial<CreateClassInput>;

  interface ClassWriteData {
    name: string;
    cohort: string;
    instrumentId: string;
    description: string | null;
    startDate: Date;
    endDate: Date;
    roadmapId?: string | null;
  }

  interface MemberRecord {
    id: string;
    joinedAt: Date;
    user: { id: string; username: string; email: string; studentCode: string | null; status: UserStatus };
  }

  interface MemberDTO {
    studentId: string;
    fullName: string;
    studentCode: string | null;
    email: string;
    accountStatus: UserStatus;
    joinedAt: string;
  }

  interface MemberListQuery {
    q?: string;
    accountStatus: AccountStatusFilter;
    page: number;
    limit: number;
  }

  interface MemberListResult {
    items: MemberDTO[];
    pagination: PaginationMeta;
    totalMembers: number;
  }

  interface StudentRowInput {
    studentCode: string;
    fullName: string;
    email: string;
  }

  interface RawStudentRow extends StudentRowInput {
    rowNumber: number;
  }

  interface ExistingUserSnapshot {
    id: string;
    email: string;
    studentCode: string | null;
    role: UserRole;
  }

  interface StudentValidationContext {
    usersByEmail: Map<string, ExistingUserSnapshot>;
    usersByStudentCode: Map<string, ExistingUserSnapshot>;
    activeMemberIds: Set<string>;
    studentRole: UserRole;
  }

  interface ValidatedStudentRow extends RawStudentRow {
    isValid: boolean;
    reason: string | null;
    reasonField: StudentRowField | null;
    existingUserId: string | null;
  }

  interface UploadedImportFile {
    originalname: string;
    size: number;
    buffer: Buffer;
  }

  interface ParsedImportFile {
    fileType: ImportFileType;
    rows: RawStudentRow[];
  }

  interface ImportLogRecord {
    id: string;
    classId: string;
    lecturerId: string;
    fileName: string;
    status: ImportLogStatus;
    totalRows: number;
    rows: unknown;
  }

  interface ImportPreviewDTO {
    logId: string;
    fileName: string;
    status: ImportLogStatus;
    totalRows: number;
    validRows: number;
    errorRows: number;
    rows: Array<{ rowNumber: number; studentCode: string; fullName: string; email: string; isValid: boolean; reason: string | null }>;
  }

  interface ImportConfirmResult {
    importedCount: number;
    skippedCount: number;
  }

  interface AuditEntry {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }
}
