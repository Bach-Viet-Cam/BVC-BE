import { test } from 'node:test';
import assert from 'node:assert/strict';
import PitchChartBuilderService from './PitchChartBuilderService.ts';

// 1 frame = 0.5 s keeps the expected times readable
const rawFile = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  pitch: { sampleRate: 2, hopLength: 1, teacherF0Hz: [220, 220, null, 330], studentF0Hz: [221, null, 333] },
  alignment: { studentFrameByTeacherFrame: [0, 0, 1, 2] },
  ...overrides
});

const issue: Practice.ResultIssueDTO = {
  id: 'r0', kind: 'rhythm', startSec: 0.5, endSec: 9, rhythmStatus: 'fast', centsDifference: null, label: 'Nhanh hơn bản mẫu'
};

test('Biểu đồ đặt cao độ học viên theo trục thời gian bản mẫu qua căn chỉnh DTW, giữ khoảng lặng là null', () => {
  const chart = PitchChartBuilderService.build(PitchChartBuilderService.parse(rawFile()), [issue]);
  assert.deepEqual(chart.points, [[0, 220, 221], [0.5, 220, 221], [1, null, null], [1.5, 330, 333]]);
  assert.equal(chart.durationSec, 2);
  assert.deepEqual(chart.timeMap, [[0, 0], [0.5, 0], [1, 0.5], [1.5, 1]]);
});

test('Biên trục tung rộng hơn cao độ thấp nhất / cao nhất một nửa cung', () => {
  const chart = PitchChartBuilderService.build(PitchChartBuilderService.parse(rawFile()), []);
  assert.equal(chart.minHz, Math.round((220 / 2 ** (1 / 12)) * 100) / 100);
  assert.equal(chart.maxHz, Math.round(333 * 2 ** (1 / 12) * 100) / 100);
});

test('Vùng lỗi bị cắt theo thời lượng bản mẫu, giữ cùng id với danh sách lỗi', () => {
  const chart = PitchChartBuilderService.build(PitchChartBuilderService.parse(rawFile()), [issue, { ...issue, id: 'r1', startSec: 5 }]);
  assert.deepEqual(chart.segments, [{ id: 'r0', kind: 'rhythm', startSec: 0.5, endSec: 2, label: 'Nhanh hơn bản mẫu' }]);
});

test('Bản dài được gộp tối đa 600 điểm; mỗi điểm là trung vị, null khi dưới một nửa khung có cao độ', () => {
  const teacher = Array.from({ length: 6000 }, (_, index) => (index % 10 < 4 ? null : 200 + (index % 10)));
  const points = PitchChartBuilderService.downsample(teacher, teacher, 0.01);
  assert.equal(points.length, 600);
  assert.deepEqual(points[0], [0, 206.5, 206.5]); // median of 204..209
  assert.equal(PitchChartBuilderService.bucketMedian([null, null, 220]), null);
  assert.equal(PitchChartBuilderService.bucketMedian([null, 210, 220]), 215);
});

test('File sai định dạng, lệch số khung hoặc không có cao độ nào đều bị từ chối', () => {
  assert.throws(() => PitchChartBuilderService.parse({ pitch: {} }));
  assert.throws(() => PitchChartBuilderService.parse(rawFile({ alignment: { studentFrameByTeacherFrame: [0] } })));
  const silent = PitchChartBuilderService.parse(rawFile({
    pitch: { sampleRate: 2, hopLength: 1, teacherF0Hz: [null, null], studentF0Hz: [null] },
    alignment: { studentFrameByTeacherFrame: [0, 0] }
  }));
  assert.throws(() => PitchChartBuilderService.build(silent, []));
});
