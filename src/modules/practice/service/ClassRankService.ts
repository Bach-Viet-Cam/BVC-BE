import PracticeConstant from '../constant/PracticeConstant.ts';

const { minClassPeers, scoreBucketSize } = PracticeConstant;
const MAX_SCORE = 100;

// Anonymous position of one submission among classmates' best scores on the same assignment.
// GBR-53: with fewer than minClassPeers classmates the comparison would reveal individual scores, so only the
// student's own score is returned (hasEnoughPeers = false) and the card explains why there is no ranking yet.
export default class ClassRankService {
  calculate(className: string, accuracy: number, peerScores: number[]): Practice.ClassRankDTO {
    const myScore = Math.round(accuracy);
    const peers = peerScores.map((score) => Math.round(score));
    if (peers.length < minClassPeers) {
      return {
        className, peerCount: peers.length, minPeers: minClassPeers, hasEnoughPeers: false, myScore,
        classAverage: null, betterThanPercent: null, topPercent: null, distribution: []
      };
    }
    const betterThanPercent = Math.round((peers.filter((score) => score < myScore).length / peers.length) * 100);
    const everyone = [...peers, myScore];
    return {
      className,
      peerCount: peers.length,
      minPeers: minClassPeers,
      hasEnoughPeers: true,
      myScore,
      classAverage: Math.round(everyone.reduce((total, score) => total + score, 0) / everyone.length),
      betterThanPercent,
      topPercent: Math.max(1, 100 - betterThanPercent),
      distribution: this.toDistribution(everyone)
    };
  }

  // Students per score bucket (0, 10, ..., 100), each score counted in its nearest bucket
  private toDistribution(scores: number[]): { score: number; count: number }[] {
    const buckets = Array.from({ length: MAX_SCORE / scoreBucketSize + 1 }, (_, index) => ({ score: index * scoreBucketSize, count: 0 }));
    for (const score of scores) {
      const index = Math.round(Math.min(MAX_SCORE, Math.max(0, score)) / scoreBucketSize);
      buckets[index].count += 1;
    }
    return buckets;
  }
}
