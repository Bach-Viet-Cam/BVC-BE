export default class AuthDTO {
  static toUserDTO(user: Backend.UserRecord): Backend.UserDTO {
    return { userId: user.id, username: user.username, email: user.email, role: user.role };
  }
}
