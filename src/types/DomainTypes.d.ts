declare namespace Backend {
  type UserRole = number;
  type UserStatus = 'PENDING' | 'ACTIVE' | 'LOCKED';
  interface UserRecord { id: string; email: string; username: string; role: UserRole; status: UserStatus; studentCode: string | null; }
  interface UserDTO { userId: string; username: string; email: string; role: UserRole; }
  interface GoogleAuthRequest { credential: string; role?: UserRole; }
  interface GoogleProfile { providerId: string; email: string; username: string; }
  interface AuthTokens { refreshToken: string; accessToken: string; }
  interface AuthResult extends AuthTokens { user: UserDTO; }
  interface SessionRecord { id: string; userId: string; refreshHash: string; expiresAt: Date; user: UserRecord; }
  interface ApiResponseOptions<TData = unknown> { statusCode?: number; data: TData; message?: string; }
  interface PaginatedResult<TItem> { items: TItem[]; total: number; page: number; pageSize: number; }
  interface UserAdminRecord extends UserRecord { lastLoginAt: Date | null; }
  interface UserListItem { id: string; username: string; email: string; role: UserRole; status: UserStatus; studentCode: string | null; lastLoginAt: string | null; }
  interface UserListQuery { role?: number; status?: UserStatus; q?: string; sortBy: 'username' | 'email' | 'role' | 'status'; sortDir: 'asc' | 'desc'; page: number; pageSize: number; }
  interface UserCreateInput { email: string; username: string; role: UserRole; studentCode?: string; }
  interface UserUpdateInput { email?: string; username?: string; role?: UserRole; studentCode?: string | null; }
}
