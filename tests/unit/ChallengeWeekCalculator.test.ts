import { describe, expect, it } from 'vitest';
import ChallengeWeekCalculator from '../../src/modules/challenges/service/ChallengeWeekCalculator.ts';

describe('ChallengeWeekCalculator', () => {
  it('builds Monday 00:00 to Sunday 23:59:59.999 in UTC+7', () => {
    const { startsAt, endsAt } = ChallengeWeekCalculator.weekBounds('2026-12-28');
    expect(startsAt.toISOString()).toBe('2026-12-27T17:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2027-01-03T16:59:59.999Z');
  });

  it('detects Mondays', () => {
    expect(ChallengeWeekCalculator.isMonday('2026-12-28')).toBe(true);
    expect(ChallengeWeekCalculator.isMonday('2026-12-29')).toBe(false);
    expect(ChallengeWeekCalculator.isMonday('2026-02-30')).toBe(false);
    expect(ChallengeWeekCalculator.isMonday('abc')).toBe(false);
  });

  it('starts the current week at now', () => {
    const now = new Date('2026-12-30T05:00:00.000Z');
    const period = ChallengeWeekCalculator.resolvePeriod('2026-12-28', now);
    expect(period.startsAt).toEqual(now);
    expect(period.endsAt.toISOString()).toBe('2027-01-03T16:59:59.999Z');
  });

  it('starts a future week on Monday 00:00 +07', () => {
    const now = new Date('2026-12-30T05:00:00.000Z');
    const period = ChallengeWeekCalculator.resolvePeriod('2027-01-04', now);
    expect(period.startsAt.toISOString()).toBe('2027-01-03T17:00:00.000Z');
  });

  it('flags past weeks', () => {
    const now = new Date('2026-12-30T05:00:00.000Z');
    expect(ChallengeWeekCalculator.isPastWeek('2026-12-21', now)).toBe(true);
    expect(ChallengeWeekCalculator.isPastWeek('2026-12-28', now)).toBe(false);
    expect(ChallengeWeekCalculator.isPastWeek('2027-01-04', now)).toBe(false);
  });
});
