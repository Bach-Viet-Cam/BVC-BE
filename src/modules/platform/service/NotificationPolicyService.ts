import AuthConstant from '../../auth/constant/AuthConstant.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';

export default class NotificationPolicyService {
  static resolveOutcome(input: { action: 'draft' | 'send'; scheduledAt: Date | null; now: Date }): {
    outcome: Backend.NotificationOutcome;
    scheduledAt: Date | null;
    error?: string;
  } {
    if (input.action === 'draft') return { outcome: 'DRAFT', scheduledAt: input.scheduledAt };
    if (input.scheduledAt === null) return { outcome: 'SEND_NOW', scheduledAt: null };
    const time = input.scheduledAt.getTime();
    if (Number.isNaN(time) || time <= input.now.getTime()) {
      return { outcome: 'DRAFT', scheduledAt: null, error: PlatformConstant.messages.NOTIFICATION_SCHEDULE_PAST };
    }
    return { outcome: 'SCHEDULED', scheduledAt: input.scheduledAt };
  }

  static canModify(status: Backend.NotificationStatusName): boolean {
    return status !== 'SENT';
  }

  static recipientRoles(target: Backend.NotificationTargetName): number[] | null {
    if (target === 'STUDENT') return [AuthConstant.roles.STUDENT];
    if (target === 'TEACHER') return [AuthConstant.roles.TEACHER];
    return null;
  }
}
