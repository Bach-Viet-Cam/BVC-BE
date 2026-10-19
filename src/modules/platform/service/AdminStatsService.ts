import PlatformConstant from "../constant/PlatformConstant.ts";
import AdminStatsDTO from "../dto/AdminStatsDTO.ts";
import AdminStatsRepository from "../repository/AdminStatsRepository.ts";
import SystemConfigRepository from "../repository/SystemConfigRepository.ts";
import AdminStatsPolicyService from "./AdminStatsPolicyService.ts";
import StorageUsageService from "./StorageUsageService.ts";

export default class AdminStatsService {
  static readonly dayMs = 86400000;
  static readonly bytesPerGb = 1024 ** 3;

  static subtractDays(now: Date, days: number): Date {
    return new Date(now.getTime() - days * AdminStatsService.dayMs);
  }

  static async getCapacityGb(): Promise<number> {
    const config = await SystemConfigRepository.findByKey(
      PlatformConstant.stats.capacityConfigKey,
    );
    const parsed = config ? Number(config.value) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : PlatformConstant.stats.defaultCapacityGb;
  }

  static async getStorage(): Promise<Backend.StorageSummary> {
    const [usage, capacityGb] = await Promise.all([
      StorageUsageService.measureUploads(),
      AdminStatsService.getCapacityGb(),
    ]);
    const capacityBytes = capacityGb * AdminStatsService.bytesPerGb;
    return {
      usedBytes: usage.usedBytes,
      capacityBytes,
      usedPercent: AdminStatsPolicyService.toPercent(
        usage.usedBytes,
        capacityBytes,
      ),
      fileCount: usage.fileCount,
    };
  }

  static async getConfigSummary(
    activeInstrumentCount: number,
  ): Promise<Backend.AdminConfigSummary[]> {
    const configs = await Promise.all(
      PlatformConstant.stats.overviewConfigKeys.map((key) =>
        SystemConfigRepository.findByKey(key),
      ),
    );
    const rows = configs
      .filter((config): config is Backend.SystemConfigRecord => config !== null)
      .map((config) => ({ label: config.label, value: config.value }));
    return [
      { label: "Nhạc cụ đang hoạt động", value: String(activeInstrumentCount) },
      ...rows,
    ];
  }

  static async getOverview(
    now: Date = new Date(),
  ): Promise<Backend.AdminOverview> {
    const stats = PlatformConstant.stats;
    // +1 ngày đệm để không mất bản ghi sát nửa đêm UTC+7; buildDailySeries tự bỏ phần ngoài cửa sổ.
    const seriesSince = AdminStatsService.subtractDays(
      now,
      stats.overviewDays + 1,
    );
    const [
      activeUsers7d,
      submissions7d,
      failed24h,
      dates,
      recentUsers,
      activeInstrumentCount,
      storage,
      queueCount,
    ] = await Promise.all([
      AdminStatsRepository.countActiveUsersSince(
        AdminStatsService.subtractDays(now, stats.activeUserDays),
      ),
      AdminStatsRepository.countSubmissionsSince(
        AdminStatsService.subtractDays(now, 7),
      ),
      AdminStatsRepository.countSubmissionsSince(
        AdminStatsService.subtractDays(now, 1),
        "FAILED",
      ),
      AdminStatsRepository.listSubmissionDatesSince(seriesSince),
      AdminStatsRepository.listRecentUsers(stats.recentUserLimit),
      AdminStatsRepository.countActiveInstruments(),
      AdminStatsService.getStorage(),
      AdminStatsRepository.countProcessing(),
    ]);
    return {
      activeUsers7d,
      submissions7d,
      failed24h,
      storage,
      submissionsByDay: AdminStatsPolicyService.buildDailySeries(
        dates,
        stats.overviewDays,
        now,
        stats.utcOffsetMinutes,
      ),
      recentUsers: recentUsers.map(AdminStatsDTO.toRecentUser),
      alerts: AdminStatsPolicyService.buildAlerts({
        storagePercent: storage.usedPercent,
        queueCount,
        failed24h,
      }),
      config: await AdminStatsService.getConfigSummary(activeInstrumentCount),
    };
  }

  static async getMonitoring(
    now: Date = new Date(),
  ): Promise<Backend.AdminMonitoring> {
    const stats = PlatformConstant.stats;
    const since7d = AdminStatsService.subtractDays(now, 7);
    const [
      queueCount,
      queueRows,
      total7d,
      failed7d,
      submissions24h,
      failed24h,
      dates,
      failedRows,
      storage,
    ] = await Promise.all([
      AdminStatsRepository.countProcessing(),
      AdminStatsRepository.listProcessing(stats.queueLimit),
      AdminStatsRepository.countSubmissionsSince(since7d),
      AdminStatsRepository.countSubmissionsSince(since7d, "FAILED"),
      AdminStatsRepository.countSubmissionsSince(
        AdminStatsService.subtractDays(now, 1),
      ),
      AdminStatsRepository.countSubmissionsSince(
        AdminStatsService.subtractDays(now, 1),
        "FAILED",
      ),
      AdminStatsRepository.listSubmissionDatesSince(
        AdminStatsService.subtractDays(now, stats.monitoringDays + 1),
      ),
      AdminStatsRepository.listFailed(stats.failureLimit),
      AdminStatsService.getStorage(),
    ]);
    return {
      queueCount,
      queue: queueRows.map((row) => AdminStatsDTO.toQueueItem(row, now)),
      total7d,
      failed7d,
      errorRate7d: AdminStatsPolicyService.toPercent(failed7d, total7d),
      submissions24h,
      storage,
      submissionsByDay: AdminStatsPolicyService.buildDailySeries(
        dates,
        stats.monitoringDays,
        now,
        stats.utcOffsetMinutes,
      ),
      failures: failedRows.map(AdminStatsDTO.toFailure),
      alerts: AdminStatsPolicyService.buildAlerts({
        storagePercent: storage.usedPercent,
        queueCount,
        failed24h,
      }),
    };
  }
}
