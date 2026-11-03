import { test } from 'node:test';
import assert from 'node:assert/strict';
import CompareSegmentMatcherService from './CompareSegmentMatcherService.ts';

const rhythmLabels = { fast: 'Nhanh hơn bản mẫu', slow: 'Chậm hơn bản mẫu', missing: 'Thiếu nốt' } as const;

function pitch(start: number, end: number, label = 'Lệch +10¢', cents = 10): Practice.ResultIssueDTO {
  return { id: `p-${start}`, kind: 'pitch', startSec: start, endSec: end, rhythmStatus: null, centsDifference: cents, label };
}

function rhythm(start: number, end: number, status: Practice.RhythmIssueStatus = 'fast'): Practice.ResultIssueDTO {
  return { id: `r-${start}`, kind: 'rhythm', startSec: start, endSec: end, rhythmStatus: status, centsDifference: null, label: rhythmLabels[status] };
}

test('chồng lấn đúng 50% đoạn ngắn hơn thì là lỗi lặp lại', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(10, 12, 'cũ')], [pitch(11, 13, 'mới')]);
  assert.equal(segments.length, 1);
  assert.deepEqual(segments[0], {
    id: 'pitch-10-REPEATED', kind: 'pitch', status: 'REPEATED', startSec: 10, endSec: 12, olderLabel: 'cũ', newerLabel: 'mới'
  });
});

test('chồng lấn dưới 50% thì bài mới vẫn còn lỗi ở đó: không phải đã cải thiện, đoạn mới thành NEW', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(10, 12, 'cũ')], [pitch(11.02, 13, 'mới')]);
  assert.deepEqual(segments.map((segment) => [segment.status, segment.startSec, segment.endSec]), [['NEW', 11.02, 13]]);
  assert.equal(segments[0].olderLabel, null);
});

test('khác loại lỗi không khớp, và lỗi khác loại ở bài mới thì đoạn cũ không được coi là đã cải thiện', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(10, 12)], [rhythm(10, 12)]);
  assert.deepEqual(segments.map((segment) => segment.status), ['NEW']);
});

test('đoạn cũ không còn lỗi nào ở bài mới trong cùng khoảng thì là đã cải thiện', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(10, 12, 'cũ')], [pitch(20, 21), rhythm(12, 13)]);
  assert.deepEqual(segments.map((segment) => [segment.status, segment.startSec]), [['IMPROVED', 10], ['NEW', 12], ['NEW', 20]]);
});

test('lỗi nhịp đổi trạng thái vẫn là lặp lại', () => {
  const { segments } = CompareSegmentMatcherService.match([rhythm(4, 6, 'fast')], [rhythm(4, 6, 'slow')]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].status, 'REPEATED');
  assert.equal(segments[0].newerLabel, 'Chậm hơn bản mẫu');
});

test('đoạn dài 0 được nới thành độ dài tối thiểu', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(5, 5)], [pitch(4.9, 5.2)]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].status, 'REPEATED');
  assert.equal(segments[0].startSec, 5);
  assert.equal(segments[0].endSec, 5);
});

test('một đoạn mới khớp nhiều đoạn cũ', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(2, 3), pitch(3.5, 4.5)], [pitch(2, 4.5)]);
  assert.deepEqual(segments.map((segment) => [segment.status, segment.startSec, segment.endSec]), [['REPEATED', 2, 3], ['REPEATED', 3.5, 4.5]]);
});

test('newerLabel lấy đoạn chồng lấn lớn nhất', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(0, 4)], [pitch(0, 1, 'A'), pitch(1, 4, 'B')]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].newerLabel, 'B');
});

test('gộp đoạn nhịp liền nhau cùng nhãn', () => {
  const { segments } = CompareSegmentMatcherService.match([rhythm(4, 6), rhythm(6, 8)], [rhythm(4, 6), rhythm(6, 8)]);
  assert.deepEqual(segments.map((segment) => [segment.status, segment.startSec, segment.endSec]), [['REPEATED', 4, 8]]);
});

test('không gộp đoạn khác nhãn', () => {
  const { segments } = CompareSegmentMatcherService.match([rhythm(4, 6), rhythm(6, 8)], [rhythm(4, 6)]);
  assert.deepEqual(segments.map((segment) => [segment.status, segment.startSec, segment.endSec]), [['REPEATED', 4, 6], ['IMPROVED', 6, 8]]);
});

test('gộp pitch lấy nhãn có mức lệch lớn nhất', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(1, 2, 'Lệch -20¢', -20), pitch(2.05, 3, 'Lệch +45¢', 45)], []);
  assert.equal(segments.length, 1);
  assert.deepEqual([segments[0].status, segments[0].startSec, segments[0].endSec, segments[0].olderLabel], ['IMPROVED', 1, 3, 'Lệch +45¢']);
});

test('thứ tự REPEATED, IMPROVED, NEW rồi theo startSec', () => {
  const older = [pitch(30, 31), pitch(1, 2), pitch(20, 21), rhythm(10, 12)];
  const newer = [pitch(1, 2), pitch(30, 31), pitch(40, 41), pitch(5, 6)];
  const { segments } = CompareSegmentMatcherService.match(older, newer);
  assert.deepEqual(segments.map((segment) => [segment.status, segment.startSec]), [
    ['REPEATED', 1], ['REPEATED', 30], ['IMPROVED', 10], ['IMPROVED', 20], ['NEW', 5], ['NEW', 40]
  ]);
});

test('noSegmentsToCompare khi cả hai không lỗi', () => {
  assert.deepEqual(CompareSegmentMatcherService.match([], []), { segments: [], noSegmentsToCompare: true });
});

test('noSegmentsToCompare khi chỉ bài mới có lỗi', () => {
  const result = CompareSegmentMatcherService.match([], [pitch(1, 2)]);
  assert.equal(result.noSegmentsToCompare, true);
  assert.deepEqual(result.segments.map((segment) => segment.status), ['NEW']);
});

test('id ổn định theo kind, startSec, status', () => {
  const { segments } = CompareSegmentMatcherService.match([pitch(10, 12)], [pitch(10, 12)]);
  assert.equal(segments[0].id, 'pitch-10-REPEATED');
});
