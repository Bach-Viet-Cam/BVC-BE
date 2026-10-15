import AuthConstant from '../../auth/constant/AuthConstant.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';

export default class UserPolicyService {
  static canChangeRole(input: { actorId: string; targetId: string; currentRole: number; nextRole: number; targetOwnsActiveClasses: boolean }): { isAllowed: boolean; message?: string } {
    if (input.currentRole === input.nextRole) return { isAllowed: true };
    if (input.actorId === input.targetId) return { isAllowed: false, message: PlatformConstant.messages.CANNOT_CHANGE_OWN_ROLE };
    if (input.currentRole === AuthConstant.roles.TEACHER && input.targetOwnsActiveClasses) {
      return { isAllowed: false, message: PlatformConstant.messages.TEACHER_HAS_ACTIVE_CLASSES };
    }
    return { isAllowed: true };
  }

  static canLock(input: { actorId: string; targetId: string }): boolean {
    return input.actorId !== input.targetId;
  }

  static canChangeEmail(input: { hasEverSignedIn: boolean }): boolean {
    return !input.hasEverSignedIn;
  }
}
