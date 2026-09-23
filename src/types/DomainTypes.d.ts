declare namespace Backend {
  type UserRole = number;
  interface UserRecord { id: string; email: string; username: string; role: UserRole; }
  interface UserDTO { userId: string; username: string; email: string; role: UserRole; }
  interface GoogleAuthRequest { credential: string; role?: UserRole; }
  interface GoogleProfile { providerId: string; email: string; username: string; }
  interface AuthTokens { refreshToken: string; accessToken: string; }
  interface AuthResult extends AuthTokens { user: UserDTO; }
  interface SessionRecord { id: string; userId: string; refreshHash: string; expiresAt: Date; user: UserRecord; }
  interface ApiResponseOptions<TData = unknown> { statusCode?: number; data: TData; message?: string; }
}
