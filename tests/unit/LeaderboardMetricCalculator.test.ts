import { describe, expect, it } from 'vitest';
import LeaderboardMetricCalculator from '../../src/modules/leaderboard/service/LeaderboardMetricCalculator.ts';

const submission = (overrides: Partial<Backend.LeaderboardSubmission> = {}): Backend.LeaderboardSubmission => ({
  assignmentId: 'a1',
  kind: 'SOLO',
  isCounted: true,
  status: 'COMPLETED',
  accuracy: 80,
  submittedAt: new Date('2026-10-20T03:00:00Z'),
  ...overrides
});

const ensemble = (status: Backend.EnsembleSessionStatus, createdAt: string): Backend.LeaderboardEnsembleSession => ({ status, createdAt: new Date(createdAt) });
const activity = (overrides: Partial<Backend.LeaderboardActivity> = {}): Backend.LeaderboardActivity => ({
  submissions: [],
  ensembleSessions: [],
  assignmentIds: [],
  bonusAssignments: [],
  ...overrides
});

describe('LeaderboardMetricCalculator.accuracy', () => {
  it.each([
    ['best completed per assignment, averaged', [submission({ accuracy: 60 }), submission({ accuracy: 90 }), submission({ assignmentId: 'a2', accuracy: 70 })], 80],
    ['ignores rejected, failed and processing', [submission({ status: 'REJECTED', accuracy: 99 }), submission({ status: 'FAILED', accuracy: 99 }), submission({ accuracy: 50 })], 50],
    ['ignores bonus and uncounted assignments', [submission({ kind: 'BONUS', isCounted: false, accuracy: 100 }), submission({ assignmentId: 'a3', isCounted: false, accuracy: 100 }), submission({ accuracy: 40 })], 40],
    ['null when nothing completed', [submission({ status: 'REJECTED' })], null]
  ])('%s', (_name, submissions, expected) => {
    expect(LeaderboardMetricCalculator.accuracy(submissions)).toBe(expected);
  });
});

describe('LeaderboardMetricCalculator.weeklyImprovement', () => {
  const weekStart = '2026-10-19';
  const thisWeek = (accuracy: number) => submission({ accuracy, submittedAt: new Date('2026-10-21T03:00:00Z') });
  const lastWeek = (accuracy: number) => submission({ accuracy, submittedAt: new Date('2026-10-14T03:00:00Z') });

  it('this week average minus last week average', () => {
    expect(LeaderboardMetricCalculator.weeklyImprovement([thisWeek(80), thisWeek(90), lastWeek(70)], weekStart)).toBe(15);
  });
  it('can be negative', () => {
    expect(LeaderboardMetricCalculator.weeklyImprovement([thisWeek(60), lastWeek(70)], weekStart)).toBe(-10);
  });
  it.each([
    ['only this week', [thisWeek(80)]],
    ['only last week', [lastWeek(80)]],
    ['neither', []],
    ['two weeks ago does not count', [thisWeek(80), submission({ submittedAt: new Date('2026-10-05T03:00:00Z') })]]
  ])('null when a week is missing: %s', (_name, submissions) => {
    expect(LeaderboardMetricCalculator.weeklyImprovement(submissions, weekStart)).toBeNull();
  });
  it('ignores bonus and uncounted submissions', () => {
    const bonus = submission({ isCounted: false, accuracy: 0, submittedAt: new Date('2026-10-21T03:00:00Z') });
    expect(LeaderboardMetricCalculator.weeklyImprovement([thisWeek(80), lastWeek(70), bonus], weekStart)).toBe(10);
  });
  it('week boundary follows UTC+7: Sunday 23:59 is last week, Monday 00:00 is this week', () => {
    const sundayNight = submission({ accuracy: 50, submittedAt: new Date('2026-10-18T16:59:00Z') });
    const mondayMorning = submission({ accuracy: 70, submittedAt: new Date('2026-10-18T17:00:00Z') });
    expect(LeaderboardMetricCalculator.weeklyImprovement([sundayNight, mondayMorning], weekStart)).toBe(20);
  });
});

describe('streaks', () => {
  const day = (isoDate: string) => submission({ submittedAt: new Date(`${isoDate}T05:00:00Z`) });

  it('activityDays groups by Vietnam day and applies the minimum', () => {
    const acts = activity({ submissions: [day('2026-10-20'), day('2026-10-20'), day('2026-10-21')] });
    expect(LeaderboardMetricCalculator.activityDays(acts, 1)).toEqual(['2026-10-20', '2026-10-21']);
    expect(LeaderboardMetricCalculator.activityDays(acts, 2)).toEqual(['2026-10-20']);
  });

  it('streak day boundary UTC+7: 23:59 and 00:00 Vietnam are two different days', () => {
    const acts = activity({
      submissions: [submission({ submittedAt: new Date('2026-10-20T16:59:00Z') }), submission({ submittedAt: new Date('2026-10-20T17:00:00Z') })]
    });
    expect(LeaderboardMetricCalculator.activityDays(acts, 1)).toEqual(['2026-10-20', '2026-10-21']);
    expect(LeaderboardMetricCalculator.longestStreak(['2026-10-20', '2026-10-21'])).toBe(2);
  });

  it('counts every submission status but not failed ensemble sessions', () => {
    const acts = activity({
      submissions: [submission({ status: 'REJECTED', submittedAt: new Date('2026-10-20T05:00:00Z') })],
      ensembleSessions: [ensemble('FAILED', '2026-10-21T05:00:00Z'), ensemble('COMPLETED', '2026-10-22T05:00:00Z')]
    });
    expect(LeaderboardMetricCalculator.activityDays(acts, 1)).toEqual(['2026-10-20', '2026-10-22']);
  });

  it.each([
    [[], 0],
    [['2026-10-20'], 1],
    [['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11'], 3],
    [['2026-12-31', '2027-01-01'], 2]
  ])('longestStreak %j', (days, expected) => {
    expect(LeaderboardMetricCalculator.longestStreak(days)).toBe(expected);
  });

  it.each([
    ['empty', [], 0],
    ['ends today', ['2026-10-21', '2026-10-22'], 2],
    ['ends yesterday is still current', ['2026-10-20', '2026-10-21'], 2],
    ['ends the day before yesterday is broken', ['2026-10-19', '2026-10-20'], 0],
    ['only the last run counts', ['2026-10-10', '2026-10-11', '2026-10-21'], 1]
  ])('currentStreak %s', (_name, days, expected) => {
    expect(LeaderboardMetricCalculator.currentStreak(days, '2026-10-22')).toBe(expected);
  });
});

describe('LeaderboardMetricCalculator.weeklyActivity', () => {
  it('counts submissions and non-failed ensemble sessions in the ISO week', () => {
    const acts = activity({
      submissions: [submission({ submittedAt: new Date('2026-10-19T05:00:00Z') }), submission({ submittedAt: new Date('2026-10-18T05:00:00Z') })],
      ensembleSessions: [ensemble('COMPLETED', '2026-10-25T05:00:00Z'), ensemble('FAILED', '2026-10-21T05:00:00Z'), ensemble('COMPLETED', '2026-10-26T05:00:00Z')]
    });
    expect(LeaderboardMetricCalculator.weeklyActivity(acts, '2026-10-19')).toBe(2);
  });
});

describe('LeaderboardMetricCalculator.confirmedBonus', () => {
  const bonuses = [{ id: 'b1', bonusPoints: 5 }, { id: 'b2', bonusPoints: 10 }, { id: 'b3', bonusPoints: null }];
  it('sums bonusPoints of bonus assignments with a completed submission', () => {
    const subs = [submission({ assignmentId: 'b1', kind: 'BONUS', isCounted: false }), submission({ assignmentId: 'b2', kind: 'BONUS', isCounted: false })];
    expect(LeaderboardMetricCalculator.confirmedBonus(subs, bonuses)).toBe(15);
  });
  it('skips rejected submissions and assignments without bonusPoints', () => {
    const subs = [
      submission({ assignmentId: 'b1', kind: 'BONUS', status: 'REJECTED' }),
      submission({ assignmentId: 'b3', kind: 'BONUS' }),
      submission({ assignmentId: 'b2', kind: 'BONUS' })
    ];
    expect(LeaderboardMetricCalculator.confirmedBonus(subs, bonuses)).toBe(10);
  });
  it('counts one assignment once however many submissions', () => {
    const subs = [submission({ assignmentId: 'b1', kind: 'BONUS' }), submission({ assignmentId: 'b1', kind: 'BONUS' })];
    expect(LeaderboardMetricCalculator.confirmedBonus(subs, bonuses)).toBe(5);
  });
  it('0 when nothing', () => {
    expect(LeaderboardMetricCalculator.confirmedBonus([], bonuses)).toBe(0);
  });
});

describe('LeaderboardMetricCalculator.completionRate', () => {
  it('0 assignments is 0%', () => {
    expect(LeaderboardMetricCalculator.completionRate([], [], 70)).toBe(0);
  });
  it('passed / counted assignments in percent', () => {
    const subs = [submission({ assignmentId: 'a1', accuracy: 80 }), submission({ assignmentId: 'a2', accuracy: 50 })];
    expect(LeaderboardMetricCalculator.completionRate(subs, ['a1', 'a2', 'a3', 'a4'], 70)).toBe(25);
  });
  it('uses the best submission and the threshold is inclusive', () => {
    const subs = [submission({ accuracy: 40 }), submission({ accuracy: 70 })];
    expect(LeaderboardMetricCalculator.completionRate(subs, ['a1'], 70)).toBe(100);
  });
  it('rejected submissions do not pass', () => {
    expect(LeaderboardMetricCalculator.completionRate([submission({ status: 'REJECTED', accuracy: 99 })], ['a1'], 70)).toBe(0);
  });
});

describe('LeaderboardMetricCalculator.hasActivity', () => {
  const window = { from: '2026-09-07', to: '2026-12-27' };
  it('any submission of any status inside the window', () => {
    const failed = submission({ status: 'FAILED', submittedAt: new Date('2026-10-01T05:00:00Z') });
    expect(LeaderboardMetricCalculator.hasActivity(activity({ submissions: [failed] }), window)).toBe(true);
  });
  it('ensemble failed does not count, other statuses do', () => {
    expect(LeaderboardMetricCalculator.hasActivity(activity({ ensembleSessions: [ensemble('FAILED', '2026-10-01T05:00:00Z')] }), window)).toBe(false);
    expect(LeaderboardMetricCalculator.hasActivity(activity({ ensembleSessions: [ensemble('RECORDING', '2026-10-01T05:00:00Z')] }), window)).toBe(true);
  });
  it('outside the window is not activity', () => {
    expect(LeaderboardMetricCalculator.hasActivity(activity({ submissions: [submission({ submittedAt: new Date('2026-12-27T17:00:00Z') })] }), window)).toBe(false);
  });
  it('nothing is no activity', () => {
    expect(LeaderboardMetricCalculator.hasActivity(activity(), window)).toBe(false);
  });
});
