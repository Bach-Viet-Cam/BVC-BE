import { test } from 'node:test';
import assert from 'node:assert/strict';
import ClassRankService from './ClassRankService.ts';

const service = new ClassRankService();

test('Vị trí trong lớp: tốt hơn bao nhiêu % bạn cùng lớp, top %, điểm trung bình và phân bố điểm', () => {
  const rank = service.calculate('TRD301', 82.4, [60, 70, 90, 75]);
  assert.ok(rank);
  assert.equal(rank.className, 'TRD301');
  assert.equal(rank.peerCount, 4);
  assert.equal(rank.myScore, 82);
  assert.equal(rank.betterThanPercent, 75);
  assert.equal(rank.topPercent, 25);
  assert.equal(rank.classAverage, Math.round((60 + 70 + 90 + 75 + 82) / 5));
  assert.equal(rank.distribution.length, 11);
  assert.equal(rank.distribution.reduce((total, bucket) => total + bucket.count, 0), 5);
  assert.equal(rank.distribution.find((bucket) => bucket.score === 80)?.count, 2); // 75 and 82
});

test('GBR-53: dưới 3 bạn cùng lớp có kết quả thì chỉ trả điểm của mình, không xếp hạng', () => {
  assert.deepEqual(service.calculate('TRD301', 80.4, [70, 90]), {
    className: 'TRD301', peerCount: 2, minPeers: 3, hasEnoughPeers: false, myScore: 80,
    classAverage: null, betterThanPercent: null, topPercent: null, distribution: []
  });
});

test('Đứng đầu lớp vẫn hiển thị top 1%, không phải top 0%', () => {
  assert.equal(service.calculate('TRD301', 100, [10, 20, 30])?.topPercent, 1);
});
