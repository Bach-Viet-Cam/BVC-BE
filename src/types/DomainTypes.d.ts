declare namespace Backend {
  type UserRole = number;
  type MessageCode =
    | 'MSG-01' | 'MSG-02' | 'MSG-05' | 'MSG-06' | 'MSG-07' | 'MSG-08' | 'MSG-09'
    | 'MSG-13' | 'MSG-14' | 'MSG-15' | 'MSG-35' | 'MSG-37' | 'MSG-46' | 'MSG-47';
  interface UserRecord { id: string; email: string; username: string; role: UserRole; }
  interface UserDTO { userId: string; username: string; email: string; role: UserRole; }
  interface GoogleAuthRequest { credential: string; role?: UserRole; }
  interface GoogleProfile { providerId: string; email: string; username: string; }
  interface AuthTokens { refreshToken: string; accessToken: string; }
  interface AuthResult extends AuthTokens { user: UserDTO; }
  interface SessionRecord { id: string; userId: string; refreshHash: string; expiresAt: Date; user: UserRecord; }
  interface ApiResponseOptions<TData = unknown> { statusCode?: number; data: TData; message?: string; }
  interface PaginatedResult<TItem> { items: TItem[]; total: number; page: number; pageSize: number; totalPages: number; }

  interface StoredObjectInfo { sizeBytes: number; }
  interface PresignedUpload { uploadUrl: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string; }
  interface StorageDriver {
    createUploadUrl(storageKey: string, mimeType: string, expiresInSec: number): Promise<PresignedUpload>;
    createReadUrl(storageKey: string, expiresInSec: number): Promise<string>;
    statObject(storageKey: string): Promise<StoredObjectInfo | null>;
    readRange(storageKey: string, byteCount: number): Promise<Buffer>;
    readObject(storageKey: string): Promise<Buffer>;
    openReadStream(storageKey: string): Promise<NodeJS.ReadableStream>;
    putObject(storageKey: string, content: Buffer, mimeType: string): Promise<void>;
    deleteObject(storageKey: string): Promise<void>;
  }

  interface JobQueueOptions<TPayload> {
    name: string;
    attempts: number;
    backoffMs: number;
    handler: (payload: TPayload) => Promise<void>;
    onFailed: (payload: TPayload, error: unknown) => Promise<void>;
  }
  interface JobQueue<TPayload> {
    enqueue(jobId: string, payload: TPayload): Promise<void>;
    cancel(jobId: string): Promise<void>;
    close(): Promise<void>;
  }

  interface UserNotification { title: string; body: string; link?: string; }
}
