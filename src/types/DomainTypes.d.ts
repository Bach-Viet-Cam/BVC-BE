declare namespace Backend {
  type UserRole = number;
  type UserStatus = 'PENDING' | 'ACTIVE' | 'LOCKED';
  interface UserRecord { id: string; email: string; username: string; role: UserRole; status: UserStatus; }
  interface UserDTO { userId: string; username: string; email: string; role: UserRole; }
  interface GoogleAuthRequest { credential: string; role?: UserRole; }
  interface GoogleProfile { providerId: string; email: string; username: string; }
  interface AuthTokens { refreshToken: string; accessToken: string; }
  interface AuthResult extends AuthTokens { user: UserDTO; }
  interface SessionRecord { id: string; userId: string; refreshHash: string; expiresAt: Date; user: UserRecord; }
  interface ApiResponseOptions<TData = unknown> { statusCode?: number; data: TData; message?: string; }
  type MessageCode = 'MSG-01' | 'MSG-02' | 'MSG-03' | 'MSG-04' | 'MSG-05' | 'MSG-06' | 'MSG-07' | 'MSG-08' | 'MSG-09'
    | 'MSG-13' | 'MSG-14' | 'MSG-16' | 'MSG-35' | 'MSG-37' | 'MSG-38' | 'MSG-45' | 'MSG-48';
  interface FieldError { field: string; code?: MessageCode; message: string; }
  interface InstrumentRecord { id: string; name: string; isActive: boolean; }
  interface InstrumentDTO { id: string; name: string; isActive: boolean; }
  interface PaginationMeta { page: number; limit: number; total: number; }
}
