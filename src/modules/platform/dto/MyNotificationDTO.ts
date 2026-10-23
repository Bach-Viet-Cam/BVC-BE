export default class MyNotificationDTO {
  static toItem(record: Backend.MyNotificationRecord): Backend.MyNotificationItem {
    return {
      id: record.id,
      title: record.notification.title,
      body: record.notification.body,
      type: record.notification.type,
      link: record.notification.link,
      isRead: record.isRead,
      sentAt: (record.notification.sentAt ?? record.createdAt).toISOString()
    };
  }
}
