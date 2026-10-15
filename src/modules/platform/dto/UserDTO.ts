export default class UserDTO {
  static toListItem(user: Backend.UserAdminRecord): Backend.UserListItem {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      studentCode: user.studentCode,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null
    };
  }
}
