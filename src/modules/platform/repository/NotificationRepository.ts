import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

export default class NotificationRepository {
  static readonly recordSelect = {
    id: true,
    title: true,
    body: true,
    type: true,
    target: true,
    status: true,
    scheduledAt: true,
    sentAt: true,
    recipientCount: true,
    createdAt: true
  } satisfies Prisma.NotificationSelect;

  static get client() {
    return PrismaClientProvider.instance;
  }

  static async list(query: Backend.NotificationListQuery): Promise<{ items: Backend.NotificationRecord[]; total: number }> {
    const where: Prisma.NotificationWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      NotificationRepository.client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: NotificationRepository.recordSelect
      }),
      NotificationRepository.client.notification.count({ where })
    ]);
    return { items, total };
  }

  static async findById(id: string): Promise<Backend.NotificationRecord | null> {
    return NotificationRepository.client.notification.findUnique({ where: { id }, select: NotificationRepository.recordSelect });
  }

  static async create(data: Backend.NotificationWriteData & { createdById: string }): Promise<Backend.NotificationRecord> {
    return NotificationRepository.client.notification.create({ data, select: NotificationRepository.recordSelect });
  }

  static async updateUnsent(id: string, data: Backend.NotificationWriteData): Promise<Backend.NotificationRecord | null> {
    const result = await NotificationRepository.client.notification.updateMany({ where: { id, status: { not: 'SENT' } }, data });
    return result.count === 0 ? null : NotificationRepository.findById(id);
  }

  static async removeUnsent(id: string): Promise<boolean> {
    const result = await NotificationRepository.client.notification.deleteMany({ where: { id, status: { not: 'SENT' } } });
    return result.count > 0;
  }

  static async listDueIds(now: Date, limit: number): Promise<string[]> {
    const rows = await NotificationRepository.client.notification.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  static async deliverOnce(id: string, roles: number[] | null, now: Date): Promise<number | null> {
    return NotificationRepository.client.$transaction(async (transaction) => {
      const claimed = await transaction.notification.updateMany({
        where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
        data: { status: 'SENT', sentAt: now }
      });
      if (claimed.count === 0) return null;
      const users = await transaction.user.findMany({
        where: { status: { not: 'LOCKED' }, ...(roles ? { role: { in: roles } } : {}) },
        select: { id: true }
      });
      await transaction.userNotification.createMany({
        data: users.map((user) => ({ notificationId: id, userId: user.id })),
        skipDuplicates: true
      });
      await transaction.notification.update({ where: { id }, data: { recipientCount: users.length } });
      return users.length;
    });
  }
}
