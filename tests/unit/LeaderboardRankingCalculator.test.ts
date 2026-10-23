import { describe, expect, it } from 'vitest';
import LeaderboardRankingCalculator from '../../src/modules/leaderboard/service/LeaderboardRankingCalculator.ts';

const row = (studentId: string, criteria: Partial<Record<Backend.LeaderboardCriterion, number | null>>) => ({
  studentId,
  criteria: { streak: null, accuracy: null, bonus: null, completion: null, ...criteria }
});
const all: Backend.LeaderboardCriterion[] = ['streak', 'accuracy', 'bonus', 'completion'];

describe('LeaderboardRankingCalculator.normalize', () => {
  it('scales min-max to 0-100', () => {
    expect(LeaderboardRankingCalculator.normalize([10, 20, 30])).toEqual([0, 50, 100]);
  });
  it('all equal: everyone gets 100', () => {
    expect(LeaderboardRankingCalculator.normalize([7, 7, 7])).toEqual([100, 100, 100]);
  });
  it('single student gets 100', () => {
    expect(LeaderboardRankingCalculator.normalize([0])).toEqual([100]);
  });
  it('missing values count as 0 and stay out of the min-max range', () => {
    expect(LeaderboardRankingCalculator.normalize([null, 40, 80])).toEqual([0, 0, 100]);
  });
  it('all missing: everyone 0', () => {
    expect(LeaderboardRankingCalculator.normalize([null, null])).toEqual([0, 0]);
  });
  it('empty list', () => {
    expect(LeaderboardRankingCalculator.normalize([])).toEqual([]);
  });
});

describe('LeaderboardRankingCalculator.overallScores', () => {
  it('all equal: every student scores 100', () => {
    const rows = [row('s1', { streak: 3, accuracy: 80, bonus: 5, completion: 50 }), row('s2', { streak: 3, accuracy: 80, bonus: 5, completion: 50 })];
    const scores = LeaderboardRankingCalculator.overallScores(rows, all);
    expect(scores.map((score) => score.score)).toEqual([100, 100]);
  });

  it('averages the normalised criteria and rounds to one decimal', () => {
    const rows = [row('s1', { streak: 10, accuracy: 90, bonus: 0, completion: 100 }), row('s2', { streak: 0, accuracy: 60, bonus: 10, completion: 0 }), row('s3', { streak: 5, accuracy: 70, bonus: 5, completion: 50 })];
    const scores = LeaderboardRankingCalculator.overallScores(rows, all);
    // s1: (100 + 100 + 0 + 100) / 4 = 75 ; s2: (0 + 0 + 100 + 0) / 4 = 25 ; s3: (50 + 33.33 + 50 + 50) / 4 = 45.8
    expect(scores.map((score) => score.score)).toEqual([75, 25, 45.8]);
    expect(scores[0].normalized.streak).toBe(100);
    expect(scores[2].normalized.accuracy).toBeCloseTo(33.33, 2);
  });

  it('dropping a criterion averages over the remaining three', () => {
    const rows = [row('s1', { streak: 10, accuracy: 90, bonus: 0, completion: 100 }), row('s2', { streak: 0, accuracy: 60, bonus: 10, completion: 0 })];
    const withoutBonus = LeaderboardRankingCalculator.overallScores(rows, ['streak', 'accuracy', 'completion']);
    expect(withoutBonus.map((score) => score.score)).toEqual([100, 0]);
  });

  it('a missing criterion counts as 0', () => {
    const rows = [row('s1', { streak: 4, accuracy: null, bonus: 1, completion: 10 }), row('s2', { streak: 2, accuracy: 80, bonus: 0, completion: 0 })];
    const scores = LeaderboardRankingCalculator.overallScores(rows, all);
    expect(scores[0].normalized.accuracy).toBe(0);
    expect(scores[1].normalized.accuracy).toBe(100);
  });

  it('single student', () => {
    expect(LeaderboardRankingCalculator.overallScores([row('s1', { streak: 1, accuracy: 50, bonus: 0, completion: 0 })], all)[0].score).toBe(100);
  });
});

describe('LeaderboardRankingCalculator.rank', () => {
  const input = (studentId: string, studentCode: string | null, value: number): Backend.LeaderboardRankInput => ({ studentId, studentCode, value });

  it('sequential ranking 1, 2, 3, 4: no shared ranks and no gaps', () => {
    const ranked = LeaderboardRankingCalculator.rank([input('a', 'SE1', 90), input('b', 'SE2', 80), input('c', 'SE3', 80), input('d', 'SE4', 70)], 'desc');
    expect(ranked.map((entry) => [entry.studentId, entry.rank, entry.position])).toEqual([['a', 1, 1], ['b', 2, 2], ['c', 3, 3], ['d', 4, 4]]);
  });

  it('single student is rank 1', () => {
    expect(LeaderboardRankingCalculator.rank([input('a', null, 5)], 'desc')).toEqual([{ ...input('a', null, 5), rank: 1, position: 1 }]);
  });

  it('ties are ordered by studentCode ascending, null last, then studentId', () => {
    const ranked = LeaderboardRankingCalculator.rank([input('z', null, 50), input('y', 'SE9', 50), input('x', 'SE1', 50), input('w', null, 50)], 'desc');
    expect(ranked.map((entry) => entry.studentId)).toEqual(['x', 'y', 'w', 'z']);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
  });

  it('negative values are ranked', () => {
    const ranked = LeaderboardRankingCalculator.rank([input('a', 'SE1', -5), input('b', 'SE2', 3), input('c', 'SE3', -10)], 'desc');
    expect(ranked.map((entry) => entry.studentId)).toEqual(['b', 'a', 'c']);
  });

  it('ascending direction', () => {
    const ranked = LeaderboardRankingCalculator.rank([input('a', 'SE1', 5), input('b', 'SE2', 3)], 'asc');
    expect(ranked.map((entry) => entry.studentId)).toEqual(['b', 'a']);
  });

  it('empty input', () => {
    expect(LeaderboardRankingCalculator.rank([], 'desc')).toEqual([]);
  });
});
