import type { Prisma } from '@prisma/client';

// TODO(M06): M03 only inserts notification rows; listing / reading them belongs to M06.
export default class NotificationRepository {
  static async createMany(userIds: string[], notification: Backend.NotificationInput, client: Prisma.TransactionClient): Promise<number> {
    if (userIds.length === 0) return 0;
    const result = await client.notification.createMany({ data: userIds.map((userId) => ({ userId, ...notification })) });
    return result.count;
  }
}
