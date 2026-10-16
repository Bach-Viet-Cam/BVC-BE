import { describe, expect, it } from 'vitest';
import RoadmapConstant from '../../src/modules/roadmaps/constant/RoadmapConstant.ts';
import RoadmapWeekCalculator from '../../src/modules/roadmaps/service/RoadmapWeekCalculator.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';

describe('RoadmapWeekCalculator', () => {
  it('builds 7-day windows from the class start', () => {
    expect(RoadmapWeekCalculator.buildWeekWindow('2026-09-01', 1)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-07' });
    expect(RoadmapWeekCalculator.buildWeekWindow('2026-09-01', 6)).toEqual({ startDate: '2026-10-06', endDate: '2026-10-12' });
  });

  it('resolves PAST / CURRENT / UPCOMING inclusively', () => {
    const window = { startDate: '2026-09-08', endDate: '2026-09-14' };
    expect(RoadmapWeekCalculator.resolveStatus(window, '2026-09-07')).toBe('UPCOMING');
    expect(RoadmapWeekCalculator.resolveStatus(window, '2026-09-08')).toBe('CURRENT');
    expect(RoadmapWeekCalculator.resolveStatus(window, '2026-09-14')).toBe('CURRENT');
    expect(RoadmapWeekCalculator.resolveStatus(window, '2026-09-15')).toBe('PAST');
  });

  it('uses the Vietnam day at 00:00 UTC+7', () => {
    const window = RoadmapWeekCalculator.buildWeekWindow('2026-10-15', 1);
    expect(RoadmapWeekCalculator.resolveStatus(window, DateTimeUtil.todayInVietnam(new Date('2026-10-14T16:59:59Z')))).toBe('UPCOMING');
    expect(RoadmapWeekCalculator.resolveStatus(window, DateTimeUtil.todayInVietnam(new Date('2026-10-14T17:00:00Z')))).toBe('CURRENT');
  });

  it('has 6 standard framework titles', () => {
    expect(RoadmapConstant.standardFrameworkTitles).toHaveLength(6);
    expect(RoadmapConstant.standardFrameworkTitles[0]).toBe('Làm quen nhạc cụ & kỹ thuật cơ bản');
    expect(RoadmapConstant.standardFrameworkTitles[5]).toBe('Biểu diễn cuối khóa (Final Performance)');
  });
});
