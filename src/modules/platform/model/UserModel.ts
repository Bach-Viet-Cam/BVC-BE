export default class UserModel {
  static readonly adminSelect = {
    id: true,
    email: true,
    username: true,
    role: true,
    status: true,
    studentCode: true,
    lastLoginAt: true
  };
}
