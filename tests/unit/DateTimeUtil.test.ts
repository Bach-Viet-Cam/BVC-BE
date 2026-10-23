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

  it('finds the Monday of the ISO week in Vietnam (D7)', () => {
    expect(DateTimeUtil.startOfWeekInVietnam('2026-10-22')).toBe('2026-10-19'); // Thursday
    expect(DateTimeUtil.startOfWeekInVietnam('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(DateTimeUtil.startOfWeekInVietnam('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(DateTimeUtil.startOfWeekInVietnam('2026-10-26')).toBe('2026-10-26');
  });

  it('maps an instant to its Vietnam calendar day and counts day differences', () => {
    expect(DateTimeUtil.dayKeyInVietnam(new Date('2026-10-21T17:00:00Z'))).toBe('2026-10-22');
    expect(DateTimeUtil.dayKeyInVietnam(new Date('2026-10-21T16:59:00Z'))).toBe('2026-10-21');
    expect(DateTimeUtil.diffDays('2026-10-19', '2026-10-22')).toBe(3);
    expect(DateTimeUtil.diffDays('2026-12-31', '2027-01-01')).toBe(1);
    expect(DateTimeUtil.diffDays('2026-10-22', '2026-10-19')).toBe(-3);
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

  it('defaults to the semester containing today, else the one whose end date is closest', () => {
    const semesters = [
      { name: 'SP26', startDate: '2026-01-05', endDate: '2026-04-26' },
      { name: 'SU26', startDate: '2026-05-04', endDate: '2026-08-23' },
      { name: 'FA26', startDate: '2026-09-07', endDate: '2026-12-27' }
    ];
    expect(ClassService.pickDefaultSemester(semesters, new Date('2026-10-14T03:00:00Z'))?.name).toBe('FA26');
    expect(ClassService.pickDefaultSemester(semesters, new Date('2026-08-30T03:00:00Z'))?.name).toBe('SU26');
    expect(ClassService.pickDefaultSemester(semesters, new Date('2027-02-01T03:00:00Z'))?.name).toBe('FA26');
    expect(ClassService.pickDefaultSemester([], new Date())).toBeNull();
  });
});
