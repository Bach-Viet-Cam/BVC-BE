import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import LeaderboardConstant from '../constant/LeaderboardConstant.ts';
import LeaderboardRepository from '../repository/LeaderboardRepository.ts';
import LeaderboardSnapshotService from './LeaderboardSnapshotService.ts';

// D10: no cron library in the repo, so a 5-minute timer builds today's snapshot once 08:00 (UTC+7) has passed
export default class LeaderboardScheduler {
  static timer: NodeJS.Timeout | null = null;

  static start(): void {
    if (LeaderboardScheduler.timer) return;
    LeaderboardScheduler.timer = setInterval(() => void LeaderboardScheduler.tick(), LeaderboardConstant.refresh.intervalMs);
    LeaderboardScheduler.timer.unref();
    void LeaderboardScheduler.tick(); // bù cho lần làm mới bị lỡ khi server đang tắt
  }

  static stop(): void {
    if (!LeaderboardScheduler.timer) return;
    clearInterval(LeaderboardScheduler.timer);
    LeaderboardScheduler.timer = null;
  }

  static async tick(now: Date = new Date()): Promise<void> {
    try {
      if (DateTimeUtil.hourInVietnam(now) < LeaderboardConstant.refresh.hour) return;
      const semester = await LeaderboardSnapshotService.findCurrentSemester(now);
      if (!semester) return;
      const todaySnapshot = await LeaderboardRepository.findBySemesterAndDate(semester.name, DateTimeUtil.todayInVietnam(now));
      if (todaySnapshot) return;
      await LeaderboardSnapshotService.build(now);
    } catch (error: unknown) {
      console.error('Không thể làm mới bảng xếp hạng:', error);
    }
  }
}
