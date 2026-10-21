import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

// Per-user deliveries (inbox side); rows are created by NotificationRepository when a notification is sent.
export default class UserNotificationRepository {
  static readonly recordSelect = {
    id: true,
    isRead: true,
    createdAt: true,
    notification: { select: { title: true, body: true, type: true, link: true, sentAt: true } }
  } satisfies Prisma.UserNotificationSelect;

  static get client() {
    return PrismaClientProvider.instance;
  }

  static async listForUser(userId: string, query: Backend.MyNotificationListQuery): Promise<{ items: Backend.MyNotificationRecord[]; total: number }> {
    const where: Prisma.UserNotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { isRead: false } : {}),
      ...(query.type ? { notification: { type: query.type } } : {})
    };
    const [items, total] = await Promise.all([
      UserNotificationRepository.client.userNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: UserNotificationRepository.recordSelect
      }),
      UserNotificationRepository.client.userNotification.count({ where })
    ]);
    return { items, total };
  }

  static async countUnread(userId: string): Promise<number> {
    return UserNotificationRepository.client.userNotification.count({ where: { userId, isRead: false } });
  }

  static async markRead(id: string, userId: string, now: Date): Promise<Backend.MyNotificationRecord | null> {
    const owned = await UserNotificationRepository.client.userNotification.findFirst({ where: { id, userId }, select: { isRead: true } });
    if (!owned) return null;
    if (!owned.isRead) {
      await UserNotificationRepository.client.userNotification.updateMany({ where: { id, isRead: false }, data: { isRead: true, readAt: now } });
    }
    return UserNotificationRepository.client.userNotification.findUnique({ where: { id }, select: UserNotificationRepository.recordSelect });
  }

  static async markAllRead(userId: string, now: Date): Promise<number> {
    const result = await UserNotificationRepository.client.userNotification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: now } });
    return result.count;
  }
}
