declare namespace Backend {
  type UserRole = number;
  type MessageCode =
    | 'MSG-01' | 'MSG-02' | 'MSG-03' | 'MSG-04' | 'MSG-05' | 'MSG-06' | 'MSG-07' | 'MSG-08' | 'MSG-09'
    | 'MSG-13' | 'MSG-14' | 'MSG-15' | 'MSG-16' | 'MSG-35' | 'MSG-37' | 'MSG-38' | 'MSG-45' | 'MSG-46' | 'MSG-47' | 'MSG-48';
  interface FieldError { field: string; code?: MessageCode; message: string; }
  interface PaginationMeta { page: number; limit: number; total: number; }
  interface InstrumentDTO { id: string; name: string; isActive: boolean; }
  type UserStatus = 'PENDING' | 'ACTIVE' | 'LOCKED';
  interface UserRecord { id: string; email: string; username: string; role: UserRole; status: UserStatus; studentCode: string | null; }
  interface UserDTO { userId: string; username: string; email: string; role: UserRole; }
  interface GoogleAuthRequest { credential: string; createIfMissing?: boolean; }
  interface GoogleProfile { providerId: string; email: string; username: string; }
  interface AuthTokens { refreshToken: string; accessToken: string; }
  interface AuthResult extends AuthTokens { user: UserDTO; }
  interface SessionRecord { id: string; userId: string; refreshHash: string; expiresAt: Date; user: UserRecord; }
  interface ApiResponseOptions<TData = unknown> { statusCode?: number; data: TData; message?: string; }
  interface PaginatedResult<TItem> { items: TItem[]; total: number; page: number; pageSize: number; totalPages?: number; }

  interface StoredObjectInfo { sizeBytes: number; }
  interface PresignedUpload { uploadUrl: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string; }
  interface StorageDriver {
    createReadUrl(storageKey: string): string;
    statObject(storageKey: string): Promise<StoredObjectInfo | null>;
    readRange(storageKey: string, byteCount: number): Promise<Buffer>;
    readObject(storageKey: string): Promise<Buffer>;
    openReadStream(storageKey: string): Promise<NodeJS.ReadableStream>;
    putObject(storageKey: string, content: Buffer): Promise<void>;
    writeStream(storageKey: string, source: NodeJS.ReadableStream, maxBytes: number): Promise<number>;
    deleteObject(storageKey: string): Promise<void>;
  }

  interface UserNotification { title: string; body: string; link?: string; }

  interface UserAdminRecord extends UserRecord { lastLoginAt: Date | null; }
  interface UserListItem { id: string; username: string; email: string; role: UserRole; status: UserStatus; studentCode: string | null; lastLoginAt: string | null; }
  interface UserListQuery { role?: number; status?: UserStatus; q?: string; sortBy: 'username' | 'email' | 'role' | 'status'; sortDir: 'asc' | 'desc'; page: number; pageSize: number; }
  interface UserCreateInput { email: string; username: string; role: UserRole; studentCode?: string; }
  interface UserUpdateInput { email?: string; username?: string; role?: UserRole; studentCode?: string | null; }
  interface InstrumentRecord { id: string; code: string; name: string; description: string | null; isActive: boolean; createdAt: Date; }
  interface InstrumentListQuery { q?: string; status: 'active' | 'inactive' | 'all'; sortBy: 'code' | 'name'; sortDir: 'asc' | 'desc'; }
  interface InstrumentInput { code: string; name: string; description?: string; }
  interface InstrumentUpdateInput { name?: string; description?: string | null; }
  type ConfigValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  type ConfigGroup = 'FILE_LIMIT' | 'SCORING' | 'PRACTICE_RULE';
  interface SystemConfigRecord { id: string; key: string; value: string; valueType: ConfigValueType; group: ConfigGroup; label: string; description: string | null; }
  interface Semester { name: string; startDate: string; endDate: string; }
  interface SystemConfigListQuery { group?: ConfigGroup; q?: string; sortBy: 'label' | 'group'; sortDir: 'asc' | 'desc'; }
  type SubmissionStatusName = 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  interface DirectoryUsage { usedBytes: number; fileCount: number; }
  interface DailyCount { date: string; count: number; }
  interface AdminAlert { level: 'ERROR' | 'WARN'; code: string; message: string; }
  interface StorageSummary { usedBytes: number; capacityBytes: number; usedPercent: number; fileCount: number; }
  interface SubmissionBrief { id: string; createdAt: Date; fileUrl: string | null; student: { username: string }; assignment: { title: string } | null; piece: { title: string }; }
  interface AdminRecentUserRecord { id: string; username: string; email: string; role: number; status: UserStatus; createdAt: Date; }
  interface AdminRecentUser { id: string; username: string; email: string; role: number; status: UserStatus; createdAt: string; }
  interface AdminConfigSummary { label: string; value: string; }
  interface AdminQueueItem { id: string; fileName: string; studentName: string; waitSeconds: number; }
  interface AdminFailureItem { id: string; occurredAt: string; message: string; }
  interface AdminOverview {
    activeUsers7d: number;
    submissions7d: number;
    failed24h: number;
    storage: StorageSummary;
    submissionsByDay: DailyCount[];
    recentUsers: AdminRecentUser[];
    alerts: AdminAlert[];
    config: AdminConfigSummary[];
  }
  interface AdminMonitoring {
    queueCount: number;
    queue: AdminQueueItem[];
    total7d: number;
    failed7d: number;
    errorRate7d: number;
    submissions24h: number;
    storage: StorageSummary;
    submissionsByDay: DailyCount[];
    failures: AdminFailureItem[];
    alerts: AdminAlert[];
  }
  interface ContentCategoryRecord { id: string; name: string; parentId: string | null; sortOrder: number; }
  interface ContentCategoryRow extends ContentCategoryRecord { pieceCount: number; }
  interface ContentCategoryChild { id: string; name: string; pieceCount: number; }
  interface ContentCategoryNode extends ContentCategoryChild { children: ContentCategoryChild[]; }
  interface ContentCategoryItem { id: string; name: string; parentId: string | null; }
  interface ContentCategoryInput { name: string; parentId?: string | null; }
  interface ContentCategoryUpdateInput { name: string; }
  type NotificationTypeName = 'DEADLINE' | 'ANNOUNCEMENT' | 'SYSTEM' | 'BONUS';
  type NotificationTargetName = 'ALL' | 'STUDENT' | 'TEACHER';
  type NotificationStatusName = 'DRAFT' | 'SCHEDULED' | 'SENT';
  type NotificationOutcome = 'DRAFT' | 'SCHEDULED' | 'SEND_NOW';
  interface NotificationRecord {
    id: string;
    title: string;
    body: string;
    type: NotificationTypeName;
    target: NotificationTargetName;
    status: NotificationStatusName;
    scheduledAt: Date | null;
    sentAt: Date | null;
    recipientCount: number;
    createdAt: Date;
  }
  interface NotificationItem {
    id: string;
    title: string;
    body: string;
    type: NotificationTypeName;
    target: NotificationTargetName;
    status: NotificationStatusName;
    scheduledAt: string | null;
    sentAt: string | null;
    recipientCount: number;
    createdAt: string;
  }
  interface NotificationInput {
    title: string;
    body: string;
    type: NotificationTypeName;
    target: NotificationTargetName;
    scheduledAt?: string | null;
    action: 'draft' | 'send';
  }
  interface NotificationWriteData {
    title: string;
    body: string;
    type: NotificationTypeName;
    target: NotificationTargetName;
    status: NotificationStatusName;
    scheduledAt: Date | null;
  }
  interface NotificationListQuery { status?: NotificationStatusName; page: number; pageSize: number; }
  interface MyNotificationListQuery { unreadOnly: boolean; type?: NotificationTypeName; page: number; pageSize: number; }
  interface MyNotificationRecord {
    id: string;
    isRead: boolean;
    createdAt: Date;
    notification: { title: string; body: string; type: NotificationTypeName; link: string | null; sentAt: Date | null };
  }
  interface MyNotificationItem { id: string; title: string; body: string; type: NotificationTypeName; link: string | null; isRead: boolean; sentAt: string; }
  interface MyNotificationPage extends PaginatedResult<MyNotificationItem> { unreadCount: number; }

  type ImportMode = 'skip' | 'update';
  type ImportAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
  interface UserImportRowInput { rowNumber: number; studentCode: string; username: string; email: string; }
  interface UserImportInput { rows: UserImportRowInput[]; mode: ImportMode; dryRun: boolean; }
  interface UserImportRowResult extends UserImportRowInput { action: ImportAction; messages: string[]; existingUserId: string | null; }
  interface UserImportSummary { total: number; create: number; update: number; skip: number; error: number; }
  interface UserImportResult { dryRun: boolean; results: UserImportRowResult[]; summary: UserImportSummary; createdCount: number; updatedCount: number; }
  interface UserImportCreateData { email: string; username: string; studentCode: string; }
  interface UserImportUpdateData { id: string; username: string; studentCode: string; }
}
