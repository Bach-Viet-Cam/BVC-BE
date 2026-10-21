// Business dates are evaluated in Asia/Ho_Chi_Minh (UTC+07:00); timestamps are stored in UTC.
// Calendar dates (class start/end) are carried as 'yyyy-MM-dd' strings and stored as Postgres DATE.
export default class DateTimeUtil {
  static readonly businessTimeZone = 'Asia/Ho_Chi_Minh';
  static readonly dayInMilliseconds = 24 * 60 * 60 * 1000;
  static readonly isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  static todayInVietnam(now: Date = new Date()): string {
    // en-CA formats as yyyy-MM-dd
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DateTimeUtil.businessTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
  }

  static isValidIsoDate(isoDate: string): boolean {
    if (!DateTimeUtil.isoDatePattern.test(isoDate)) return false;
    return DateTimeUtil.toIsoDate(DateTimeUtil.toDateOnly(isoDate)) === isoDate;
  }

  static toDateOnly(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00.000Z`);
  }

  static toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  static addDays(isoDate: string, days: number): string {
    const date = DateTimeUtil.toDateOnly(isoDate);
    return DateTimeUtil.toIsoDate(new Date(date.getTime() + days * DateTimeUtil.dayInMilliseconds));
  }

  static isBeforeToday(isoDate: string, now: Date = new Date()): boolean {
    return isoDate < DateTimeUtil.todayInVietnam(now);
  }

  // GBR-36: a class has started once today (UTC+7) >= its start date.
  static hasStarted(startIsoDate: string, now: Date = new Date()): boolean {
    return DateTimeUtil.todayInVietnam(now) >= startIsoDate;
  }
}
