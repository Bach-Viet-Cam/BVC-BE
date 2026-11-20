import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import RoadmapWeekCalculator from './RoadmapWeekCalculator.ts';

describe('RoadmapWeekCalculator', () => {
  describe('buildWeekWindow (Tính toán khung thời gian 7 ngày cho mỗi tuần)', () => {
    const classStartDate = '2026-09-01'; // Thứ ba

    it('tuần 1 chạy từ ngày bắt đầu đến ngày thứ 7 (start + 6 ngày)', () => {
      const window = RoadmapWeekCalculator.buildWeekWindow(classStartDate, 1);
      assert.deepEqual(window, {
        startDate: '2026-09-01',
        endDate: '2026-09-07'
      });
    });

    it('tuần 2 chạy từ ngày thứ 8 đến ngày thứ 14', () => {
      const window = RoadmapWeekCalculator.buildWeekWindow(classStartDate, 2);
      assert.deepEqual(window, {
        startDate: '2026-09-08',
        endDate: '2026-09-14'
      });
    });

    it('tuần 6 (tuần cuối) chạy từ start + 35 ngày đến start + 41 ngày (tổng 42 ngày = 6 tuần)', () => {
      const window = RoadmapWeekCalculator.buildWeekWindow(classStartDate, 6);
      assert.deepEqual(window, {
        startDate: '2026-10-06',
        endDate: '2026-10-12'
      });
    });

    it('giá trị biên: lớp học bắt đầu vào cuối tháng chuyển sang tháng mới', () => {
      const window = RoadmapWeekCalculator.buildWeekWindow('2026-10-28', 1);
      assert.deepEqual(window, {
        startDate: '2026-10-28',
        endDate: '2026-11-03'
      });
    });
  });

  describe('resolveStatus (Xác định trạng thái tuần: PAST, CURRENT, UPCOMING)', () => {
    const window = { startDate: '2026-09-08', endDate: '2026-09-14' };

    it('UPCOMING khi ngày hiện tại trước ngày bắt đầu tuần học', () => {
      assert.equal(RoadmapWeekCalculator.resolveStatus(window, '2026-09-05'), 'UPCOMING');
    });

    it('CURRENT khi ngày hiện tại nằm trong tuần học', () => {
      assert.equal(RoadmapWeekCalculator.resolveStatus(window, '2026-09-10'), 'CURRENT');
    });

    it('PAST khi ngày hiện tại sau ngày kết thúc tuần học', () => {
      assert.equal(RoadmapWeekCalculator.resolveStatus(window, '2026-09-20'), 'PAST');
    });

    describe('Giá trị biên (Boundary cases)', () => {
      it('đúng ngày bắt đầu tuần học: CURRENT', () => {
        assert.equal(RoadmapWeekCalculator.resolveStatus(window, '2026-09-08'), 'CURRENT');
      });

      it('đúng ngày kết thúc tuần học: CURRENT', () => {
        assert.equal(RoadmapWeekCalculator.resolveStatus(window, '2026-09-14'), 'CURRENT');
      });

      it('trước ngày bắt đầu đúng 1 ngày: UPCOMING', () => {
        assert.equal(RoadmapWeekCalculator.resolveStatus(window, '2026-09-07'), 'UPCOMING');
      });

      it('sau ngày kết thúc đúng 1 ngày: PAST', () => {
        assert.equal(RoadmapWeekCalculator.resolveStatus(window, '2026-09-15'), 'PAST');
      });
    });
  });
});
