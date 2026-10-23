import { describe, expect, it } from 'vitest';
import ProgressCalculator from '../../src/modules/progress/service/ProgressCalculator.ts';

const settings = { minAccuracy: 70, atRiskMargin: 40 };
const done = (assignmentId: string, accuracy: number) => ({ assignmentId, status: 'COMPLETED' as const, accuracy });

describe('ProgressCalculator', () => {
  it('average of best per assignment', () => {
    expect(ProgressCalculator.averageOfBest([done('a1', 50), done('a1', 80), done('a2', 60)])).toBe(70);
  });

  it('ignores non-completed and null accuracy', () => {
    expect(ProgressCalculator.averageOfBest([
      { assignmentId: 'a1', status: 'PROCESSING', accuracy: null },
      { assignmentId: 'a1', status: 'REJECTED', accuracy: 90 },
      { assignmentId: 'a2', status: 'COMPLETED', accuracy: null }
    ])).toBeNull();
    expect(ProgressCalculator.averageOfBest([])).toBeNull();
  });

  it('rounds to 2 decimals', () => {
    expect(ProgressCalculator.averageOfBest([done('a1', 33), done('a2', 33), done('a3', 34)])).toBe(33.33);
  });

  it('status boundaries', () => {
    expect(ProgressCalculator.resolveStatus(70, settings)).toBe('ON_TRACK');
    expect(ProgressCalculator.resolveStatus(69.99, settings)).toBe('AT_RISK');
    expect(ProgressCalculator.resolveStatus(30, settings)).toBe('AT_RISK');
    expect(ProgressCalculator.resolveStatus(29.99, settings)).toBe('BEHIND');
    expect(ProgressCalculator.resolveStatus(null, settings)).toBeNull();
  });

  it('week boundary at 00:00 UTC+7', () => {
    const start = '2026-09-01';
    expect(ProgressCalculator.weekOf(start, new Date('2026-09-07T16:59:59Z'))).toBe(1);
    expect(ProgressCalculator.weekOf(start, new Date('2026-09-07T17:00:00Z'))).toBe(2);
    expect(ProgressCalculator.weekOf(start, new Date('2026-08-31T16:59:59Z'))).toBeNull();
    expect(ProgressCalculator.weekOf(start, new Date('2026-10-12T16:59:59Z'))).toBe(6);
    expect(ProgressCalculator.weekOf(start, new Date('2026-10-12T17:00:00Z'))).toBeNull();
  });

  it('weekly averages: 6 entries, null weeks, mean of all completed in week', () => {
    const weeks = ProgressCalculator.weeklyAverages('2026-09-01', [
      { status: 'COMPLETED', accuracy: 40, submittedAt: new Date('2026-09-02T03:00:00Z') },
      { status: 'COMPLETED', accuracy: 80, submittedAt: new Date('2026-09-03T03:00:00Z') },
      { status: 'REJECTED', accuracy: null, submittedAt: new Date('2026-09-03T04:00:00Z') },
      { status: 'COMPLETED', accuracy: 90, submittedAt: new Date('2026-09-16T03:00:00Z') },
      { status: 'COMPLETED', accuracy: 10, submittedAt: new Date('2026-11-01T03:00:00Z') }
    ]);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual({ week: 1, startDate: '2026-09-01', endDate: '2026-09-07', average: 60 });
    expect(weeks[1].average).toBeNull();
    expect(weeks[2]).toMatchObject({ week: 3, average: 90 });
    expect(weeks[5]).toEqual({ week: 6, startDate: '2026-10-06', endDate: '2026-10-12', average: null });
  });
});
