const round1 = (value: number): number => Math.round(value * 10) / 10;
const maxScore = 100;

// Pure normalisation, overall score and sequential ranking (decision D4; D9 revised: no shared ranks).
export default class LeaderboardRankingCalculator {
  // Min-max to 0-100 over the present values; all equal gives 100, a missing value gives 0
  static normalize(values: Array<number | null>): number[] {
    const present = values.filter((value): value is number => value !== null);
    if (present.length === 0) return values.map(() => 0);
    const min = Math.min(...present);
    const max = Math.max(...present);
    return values.map((value) => {
      if (value === null) return 0;
      return max === min ? maxScore : ((value - min) / (max - min)) * maxScore;
    });
  }

  static overallScores(rows: Backend.LeaderboardCriteriaRow[], criteria: readonly Backend.LeaderboardCriterion[]): Backend.LeaderboardOverallScore[] {
    const normalizedByCriterion = new Map<Backend.LeaderboardCriterion, number[]>(
      criteria.map((criterion) => [criterion, LeaderboardRankingCalculator.normalize(rows.map((row) => row.criteria[criterion]))])
    );
    return rows.map((row, index) => {
      const normalized = { streak: 0, accuracy: 0, bonus: 0, completion: 0 };
      let total = 0;
      for (const criterion of criteria) {
        const value = normalizedByCriterion.get(criterion)?.[index] ?? 0;
        normalized[criterion] = value;
        total += value;
      }
      return { studentId: row.studentId, score: criteria.length === 0 ? 0 : round1(total / criteria.length), normalized };
    });
  }

  // Sequential ranking (1, 2, 3, 4): equal values never share a rank, ties are ordered by studentCode ascending (null last), then studentId
  static rank(rows: Backend.LeaderboardRankInput[], direction: 'asc' | 'desc'): Backend.LeaderboardRanked[] {
    const sign = direction === 'desc' ? -1 : 1;
    const sorted = [...rows].sort((left, right) => {
      if (left.value !== right.value) return sign * (left.value - right.value);
      if (left.studentCode !== right.studentCode) {
        if (left.studentCode === null) return 1;
        if (right.studentCode === null) return -1;
        return left.studentCode < right.studentCode ? -1 : 1;
      }
      return left.studentId < right.studentId ? -1 : 1;
    });
    return sorted.map((row, index) => ({ ...row, rank: index + 1, position: index + 1 }));
  }
}
