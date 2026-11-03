import { test } from 'node:test';
import assert from 'node:assert/strict';
import SubmissionCompareDTO from './SubmissionCompareDTO.ts';

function chart(durationSec: number, points: Practice.PitchPoint[], minHz = 200, maxHz = 300): Practice.PitchChartDTO {
  return { durationSec, minHz, maxHz, points, segments: [], timeMap: [] };
}

test('cùng số điểm thì ghép theo chỉ số', () => {
  const older = chart(0.5, [[0, 220, 210], [0.5, 220, null]]);
  const newer = chart(0.5, [[0, 220, 221], [0.5, 230, 229]]);
  assert.deepEqual(SubmissionCompareDTO.mergeCharts(older, newer).points, [[0, 220, 210, 221], [0.5, 230, null, 229]]);
});

test('khác số điểm thì lấy điểm cũ gần nhất và cắt theo chart ngắn hơn', () => {
  const older = chart(1, [[0, 220, 201], [0.5, 220, 202], [1, 220, 203]]);
  const newer = chart(2, [[0, 220, 1], [0.5, 220, 2], [1, 220, 3], [1.5, 220, 4], [2, 220, 5]]);
  const merged = SubmissionCompareDTO.mergeCharts(older, newer);
  assert.equal(merged.durationSec, 1);
  assert.deepEqual(merged.points, [[0, 220, 201, 1], [0.5, 220, 202, 2], [1, 220, 203, 3]]);
});

test('khác số điểm: điểm bài mới nằm giữa hai điểm bài cũ lấy điểm gần hơn', () => {
  const older = chart(1, [[0, 220, 201], [1, 220, 203]]);
  const newer = chart(1, [[0, 220, 1], [0.4, 220, 2], [0.6, 220, 3], [1, 220, 4]]);
  assert.deepEqual(SubmissionCompareDTO.mergeCharts(older, newer).points.map((point) => point[2]), [201, 201, 203, 203]);
});

test('minHz và maxHz bao trùm hai chart', () => {
  const merged = SubmissionCompareDTO.mergeCharts(chart(0, [], 180, 300), chart(0, [], 200, 350));
  assert.equal(merged.minHz, 180);
  assert.equal(merged.maxHz, 350);
});

test('toSide làm tròn accuracy', () => {
  const record = { id: 'sub-1', accuracy: 83.41, createdAt: new Date('2026-10-24T07:32:00Z') } as Practice.ResultRecord;
  assert.deepEqual(new SubmissionCompareDTO().toSide(record, 4), {
    submissionId: 'sub-1', submittedAt: '2026-10-24T07:32:00.000Z', attemptNo: 4, accuracy: 83
  });
});

test('toSide kẹp accuracy trong 0-100 và coi null là 0', () => {
  const at = new Date('2026-10-24T07:32:00Z');
  const dto = new SubmissionCompareDTO();
  assert.equal(dto.toSide({ id: 'a', accuracy: null, createdAt: at } as Practice.ResultRecord, 1).accuracy, 0);
  assert.equal(dto.toSide({ id: 'a', accuracy: 140, createdAt: at } as Practice.ResultRecord, 1).accuracy, 100);
});
