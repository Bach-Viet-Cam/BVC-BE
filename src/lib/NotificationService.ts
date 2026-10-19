// Web push entry point. Real delivery (service worker subscriptions) is not built yet; this stub logs.
export default class NotificationService {
  static async notifyUser(userId: string, notification: Backend.UserNotification): Promise<void> {
    console.info(`[notification] → ${userId}: ${notification.title} – ${notification.body}`);
  }
}
