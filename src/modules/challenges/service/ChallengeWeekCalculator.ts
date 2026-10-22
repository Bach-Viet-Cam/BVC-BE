import DateTimeUtil from '../../../utils/DateTimeUtil.ts';

// A challenge week runs Monday 00:00 to Sunday 23:59:59.999 in UTC+7 (Vietnam has no DST).
export default class ChallengeWeekCalculator {
  static weekBounds(mondayIso: string): { startsAt: Date; endsAt: Date } {
    const startsAt = DateTimeUtil.startOfDayInVietnam(mondayIso);
    const nextMonday = DateTimeUtil.startOfDayInVietnam(DateTimeUtil.addDays(mondayIso, 7));
    return { startsAt, endsAt: new Date(nextMonday.getTime() - 1) };
  }

  static isMonday(iso: string): boolean {
    return DateTimeUtil.isValidIsoDate(iso) && DateTimeUtil.toDateOnly(iso).getUTCDay() === 1;
  }

  // The current week starts immediately; a future week starts at its Monday 00:00.
  static resolvePeriod(mondayIso: string, now: Date): { startsAt: Date; endsAt: Date } {
    const bounds = ChallengeWeekCalculator.weekBounds(mondayIso);
    return { startsAt: bounds.startsAt.getTime() < now.getTime() ? now : bounds.startsAt, endsAt: bounds.endsAt };
  }

  static isPastWeek(mondayIso: string, now: Date): boolean {
    return ChallengeWeekCalculator.weekBounds(mondayIso).endsAt.getTime() < now.getTime();
  }
}
