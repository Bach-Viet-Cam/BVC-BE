import PlatformConstant from '../constant/PlatformConstant.ts';
import NotificationService from './NotificationService.ts';

export default class NotificationDispatchService {
  static timer: NodeJS.Timeout | null = null;

  static start(): void {
    if (NotificationDispatchService.timer) return;
    NotificationDispatchService.timer = setInterval(() => void NotificationDispatchService.tick(), PlatformConstant.notification.dispatchIntervalMs);
    NotificationDispatchService.timer.unref();
    void NotificationDispatchService.tick(); // bù cho thông báo đến hạn khi server đang tắt
  }

  static stop(): void {
    if (!NotificationDispatchService.timer) return;
    clearInterval(NotificationDispatchService.timer);
    NotificationDispatchService.timer = null;
  }

  static async tick(): Promise<void> {
    try {
      await NotificationService.deliverDue(new Date());
    } catch (error: unknown) {
      console.error('Không thể gửi thông báo hẹn giờ:', error);
    }
  }
}
