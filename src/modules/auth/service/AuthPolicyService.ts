export default class AuthPolicyService {
  static resolveLogin(status: Backend.UserStatus): { isAllowed: boolean; nextStatus: Backend.UserStatus } {
    if (status === 'LOCKED') return { isAllowed: false, nextStatus: 'LOCKED' };
    return { isAllowed: true, nextStatus: 'ACTIVE' };
  }
}
