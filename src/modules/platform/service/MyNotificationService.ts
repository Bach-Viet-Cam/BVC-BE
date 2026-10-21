import AppError from '../../../utils/AppError.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import MyNotificationDTO from '../dto/MyNotificationDTO.ts';
import UserNotificationRepository from '../repository/UserNotificationRepository.ts';

// Inbox of the signed-in user: every role only ever sees and updates its own deliveries.
export default class MyNotificationService {
  static async list(userId: string, query: Backend.MyNotificationListQuery): Promise<Backend.MyNotificationPage> {
    const [{ items, total }, unreadCount] = await Promise.all([
      UserNotificationRepository.listForUser(userId, query),
      UserNotificationRepository.countUnread(userId)
    ]);
    return { items: items.map(MyNotificationDTO.toItem), total, page: query.page, pageSize: query.pageSize, unreadCount };
  }

  static async countUnread(userId: string): Promise<{ count: number }> {
    return { count: await UserNotificationRepository.countUnread(userId) };
  }

  static async markRead(userId: string, id: string): Promise<Backend.MyNotificationItem> {
    const record = await UserNotificationRepository.markRead(id, userId, new Date());
    if (!record) throw AppError.notFound(PlatformConstant.messages.NOTIFICATION_NOT_FOUND);
    return MyNotificationDTO.toItem(record);
  }

  static async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await UserNotificationRepository.markAllRead(userId, new Date()) };
  }
}
