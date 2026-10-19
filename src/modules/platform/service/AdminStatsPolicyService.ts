import PlatformConstant from '../constant/PlatformConstant.ts';

export default class AdminStatsPolicyService {
  static readonly dayMs = 86_400_000;

  static toDayKey(date: Date, offsetMinutes: number): string {
    return new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
  }

  static buildDailySeries(dates: Date[], days: number, now: Date, offsetMinutes: number): Backend.DailyCount[] {
    const counts = new Map<string, number>();
    for (const date of dates) {
      const key = AdminStatsPolicyService.toDayKey(date, offsetMinutes);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const series: Backend.DailyCount[] = [];
    for (let daysAgo = days - 1; daysAgo >= 0; daysAgo -= 1) {
      const key = AdminStatsPolicyService.toDayKey(
        new Date(now.getTime() - daysAgo * AdminStatsPolicyService.dayMs),
        offsetMinutes
      );
      series.push({ date: key, count: counts.get(key) ?? 0 });
    }
    return series;
  }

  static toPercent(part: number, whole: number): number {
    if (!(whole > 0)) return 0;
    return Math.round((part / whole) * 1000) / 10;
  }

  static buildAlerts(input: { storagePercent: number; queueCount: number; failed24h: number }): Backend.AdminAlert[] {
    const alerts: Backend.AdminAlert[] = [];
    if (input.failed24h > 0) {
      alerts.push({
        level: 'ERROR',
        code: 'analysis_failed',
        message: `${input.failed24h} bản thu phân tích lỗi trong 24 giờ qua.`
      });
    }
    if (input.storagePercent >= PlatformConstant.stats.storageWarnPercent) {
      alerts.push({
        level: 'WARN',
        code: 'storage_high',
        message: `Dung lượng lưu trữ đã dùng ${input.storagePercent}% (ngưỡng cảnh báo ${PlatformConstant.stats.storageWarnPercent}%).`
      });
    }
    if (input.queueCount >= PlatformConstant.stats.queueWarnCount) {
      alerts.push({
        level: 'WARN',
        code: 'queue_deep',
        message: `Có ${input.queueCount} bản thu đang chờ phân tích (ngưỡng cảnh báo ${PlatformConstant.stats.queueWarnCount}).`
      });
    }
    return alerts;
  }
}
