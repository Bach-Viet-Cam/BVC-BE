import { describe, expect, it } from 'vitest';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';
import ClassService from '../../src/modules/classes/service/ClassService.ts';

describe('DateTimeUtil', () => {
  it('computes today in Asia/Ho_Chi_Minh, not UTC', () => {
    // 16:59:59 UTC = 23:59:59 UTC+7 on the same day
    expect(DateTimeUtil.todayInVietnam(new Date('2026-10-14T16:59:59Z'))).toBe('2026-10-14');
    // 17:00:00 UTC = 00:00 UTC+7 on the next day
    expect(DateTimeUtil.todayInVietnam(new Date('2026-10-14T17:00:00Z'))).toBe('2026-10-15');
  });

  it('treats a class as started from 00:00 UTC+7 of its start date (GBR-36)', () => {
    expect(DateTimeUtil.hasStarted('2026-10-15', new Date('2026-10-14T16:59:59Z'))).toBe(false);
    expect(DateTimeUtil.hasStarted('2026-10-15', new Date('2026-10-14T17:00:00Z'))).toBe(true);
    expect(DateTimeUtil.hasStarted('2026-10-15', new Date('2026-11-01T00:00:00Z'))).toBe(true);
  });

  it('detects dates before today in UTC+7', () => {
    const now = new Date('2026-10-14T17:30:00Z'); // 15/10 00:30 in Vietnam
    expect(DateTimeUtil.isBeforeToday('2026-10-14', now)).toBe(true);
    expect(DateTimeUtil.isBeforeToday('2026-10-15', now)).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(DateTimeUtil.addDays('2026-12-25', 42)).toBe('2027-02-05');
    expect(DateTimeUtil.addDays('2028-02-20', 10)).toBe('2028-03-01');
  });

  it('validates ISO calendar dates', () => {
    expect(DateTimeUtil.isValidIsoDate('2026-10-15')).toBe(true);
    expect(DateTimeUtil.isValidIsoDate('2026-02-30')).toBe(false);
    expect(DateTimeUtil.isValidIsoDate('15/10/2026')).toBe(false);
  });

  it('sets the end date to start + 6 weeks (GBR-35)', () => {
    expect(ClassService.calculateEndDate('2026-09-01')).toBe('2026-10-13');
  });
});
