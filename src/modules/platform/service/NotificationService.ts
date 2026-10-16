import type { Prisma } from '@prisma/client';
import NotificationRepository from '../repository/NotificationRepository.ts';

// TODO(M06): delivery (push / e-mail) and the notification screen are M06's.
export default class NotificationService {
  static async notifyUsers(userIds: string[], notification: Backend.NotificationInput, client: Prisma.TransactionClient): Promise<number> {
    return NotificationRepository.createMany([...new Set(userIds)], notification, client);
  }
}
