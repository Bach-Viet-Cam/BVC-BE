import type { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';
import NotificationDTO from '../dto/NotificationDTO.ts';
import NotificationRepository from '../repository/NotificationRepository.ts';
import NotificationPolicyService from './NotificationPolicyService.ts';

export default class NotificationService {
  // Sends one in-app notification to the given users inside the caller's transaction.
  static async notifyUsers(actorId: string, userIds: string[], notification: Backend.UserNotification, client: Prisma.TransactionClient): Promise<number> {
    return NotificationRepository.createDelivered(actorId, [...new Set(userIds)], notification, client);
  }

  static async list(query: Backend.NotificationListQuery): Promise<Backend.PaginatedResult<Backend.NotificationItem>> {
    const { items, total } = await NotificationRepository.list(query);
    return { items: items.map(NotificationDTO.toItem), total, page: query.page, pageSize: query.pageSize };
  }

  static async getOrThrow(id: string): Promise<Backend.NotificationRecord> {
    const notification = await NotificationRepository.findById(id);
    if (!notification) throw AppError.notFound(PlatformConstant.messages.NOTIFICATION_NOT_FOUND);
    return notification;
  }

  static plan(input: Backend.NotificationInput, now: Date): { outcome: Backend.NotificationOutcome; scheduledAt: Date | null } {
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const result = NotificationPolicyService.resolveOutcome({ action: input.action, scheduledAt, now });
    if (result.error) throw AppError.badRequest(result.error);
    return result;
  }

  static toWriteData(input: Backend.NotificationInput, plan: { outcome: Backend.NotificationOutcome; scheduledAt: Date | null }): Backend.NotificationWriteData {
    return {
      title: input.title,
      body: input.body,
      type: input.type,
      target: input.target,
      status: plan.outcome === 'SCHEDULED' ? 'SCHEDULED' : 'DRAFT',
      scheduledAt: plan.scheduledAt
    };
  }

  static async create(actorId: string, input: Backend.NotificationInput): Promise<Backend.NotificationItem> {
    const plan = NotificationService.plan(input, new Date());
    const created = await NotificationRepository.create({ ...NotificationService.toWriteData(input, plan), createdById: actorId });
    return plan.outcome === 'SEND_NOW' ? NotificationService.send(created.id) : NotificationDTO.toItem(created);
  }

  static async update(id: string, input: Backend.NotificationInput): Promise<Backend.NotificationItem> {
    const existing = await NotificationService.getOrThrow(id);
    if (!NotificationPolicyService.canModify(existing.status)) throw AppError.conflict(PlatformConstant.messages.NOTIFICATION_LOCKED);
    const plan = NotificationService.plan(input, new Date());
    const updated = await NotificationRepository.updateUnsent(id, NotificationService.toWriteData(input, plan));
    if (!updated) throw AppError.conflict(PlatformConstant.messages.NOTIFICATION_LOCKED);
    return plan.outcome === 'SEND_NOW' ? NotificationService.send(id) : NotificationDTO.toItem(updated);
  }

  static async send(id: string, now: Date = new Date()): Promise<Backend.NotificationItem> {
    const notification = await NotificationService.getOrThrow(id);
    const recipientCount = await NotificationRepository.deliverOnce(id, NotificationPolicyService.recipientRoles(notification.target), now);
    if (recipientCount === null) throw AppError.conflict(PlatformConstant.messages.NOTIFICATION_ALREADY_SENT);
    return NotificationDTO.toItem(await NotificationService.getOrThrow(id));
  }

  static async remove(id: string): Promise<{ id: string }> {
    const existing = await NotificationService.getOrThrow(id);
    if (!NotificationPolicyService.canModify(existing.status)) throw AppError.conflict(PlatformConstant.messages.NOTIFICATION_LOCKED);
    if (!(await NotificationRepository.removeUnsent(id))) throw AppError.conflict(PlatformConstant.messages.NOTIFICATION_LOCKED);
    return { id };
  }

  static async deliverDue(now: Date): Promise<number> {
    const ids = await NotificationRepository.listDueIds(now, PlatformConstant.notification.dueBatchSize);
    let delivered = 0;
    for (const id of ids) {
      try {
        await NotificationService.send(id, now);
        delivered += 1;
      } catch (error: unknown) {
        // 409/404: đã có tiến trình khác gửi hoặc đã bị xóa → bỏ qua; lỗi khác để tick ghi log.
        if (!(error instanceof AppError)) throw error;
      }
    }
    return delivered;
  }
}
