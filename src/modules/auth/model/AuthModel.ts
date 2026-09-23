export default class AuthModel {
  static readonly userSelect = { id: true, email: true, username: true, role: true };
  static readonly identityWithUserSelect = {
    id: true,
    provider: true,
    providerId: true,
    user: { select: AuthModel.userSelect }
  };
}
