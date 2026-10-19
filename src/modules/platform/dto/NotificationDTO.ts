export default class NotificationDTO {
  static toItem(record: Backend.NotificationRecord): Backend.NotificationItem {
    return {
      id: record.id,
      title: record.title,
      body: record.body,
      type: record.type,
      target: record.target,
      status: record.status,
      scheduledAt: record.scheduledAt ? record.scheduledAt.toISOString() : null,
      sentAt: record.sentAt ? record.sentAt.toISOString() : null,
      recipientCount: record.recipientCount,
      createdAt: record.createdAt.toISOString()
    };
  }
}
