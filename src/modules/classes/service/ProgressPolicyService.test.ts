import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ProgressPolicyService from './ProgressPolicyService.ts';

const rule = { minAccuracy: 70, atRiskMargin: 10 };

describe('ProgressPolicyService.getStatus', () => {
  it('ON_TRACK khi accuracy trung bình đạt mức tối thiểu', () => {
    assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 75, ...rule }), 'ON_TRACK');
    assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 70, ...rule }), 'ON_TRACK');
  });

  it('AT_RISK khi thấp hơn mức tối thiểu không quá biên', () => {
    assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 65, ...rule }), 'AT_RISK');
    assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 60, ...rule }), 'AT_RISK');
  });

  it('BEHIND khi thấp hơn mức tối thiểu quá biên', () => {
    assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 59.9, ...rule }), 'BEHIND');
    assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 0, ...rule }), 'BEHIND');
  });

  it('không có trạng thái khi chưa có bài nộp được phân tích (GBR-24)', () => {
    assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: null, ...rule }), null);
  });

  describe('Giá trị biên (Boundary cases)', () => {
    it('chính xác tại các điểm ngưỡng: 70.0 (ON_TRACK), 69.99 (AT_RISK), 60.0 (AT_RISK), 59.99 (BEHIND)', () => {
      // Ngưỡng trên: minAccuracy = 70
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 70.0, ...rule }), 'ON_TRACK');
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 69.99, ...rule }), 'AT_RISK');

      // Ngưỡng dưới: minAccuracy - atRiskMargin = 60
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 60.0, ...rule }), 'AT_RISK');
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 59.99, ...rule }), 'BEHIND');
    });

    it('giá trị cực đại 100% (ON_TRACK) và cực tiểu 0% (BEHIND)', () => {
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 100, ...rule }), 'ON_TRACK');
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 0, ...rule }), 'BEHIND');
    });

    it('khi atRiskMargin = 0: không có khoảng AT_RISK, chỉ có ON_TRACK hoặc BEHIND', () => {
      const zeroMarginRule = { minAccuracy: 75, atRiskMargin: 0 };
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 75.0, ...zeroMarginRule }), 'ON_TRACK');
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 74.9, ...zeroMarginRule }), 'BEHIND');
    });

    it('cấu hình tùy chỉnh khác: minAccuracy = 80, atRiskMargin = 15', () => {
      const customRule = { minAccuracy: 80, atRiskMargin: 15 };
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 80, ...customRule }), 'ON_TRACK');
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 79.9, ...customRule }), 'AT_RISK');
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 65.0, ...customRule }), 'AT_RISK');
      assert.equal(ProgressPolicyService.getStatus({ averageAccuracy: 64.9, ...customRule }), 'BEHIND');
    });
  });
});

describe('ProgressPolicyService.average', () => {
  it('trả null khi danh sách rỗng', () => {
    assert.equal(ProgressPolicyService.average([]), null);
  });

  it('tính trung bình và làm tròn 1 chữ số thập phân', () => {
    assert.equal(ProgressPolicyService.average([91, 88, 92]), 90.3);
  });

  describe('Giá trị biên (Boundary cases)', () => {
    it('mảng có 1 phần tử duy nhất', () => {
      assert.equal(ProgressPolicyService.average([85.4]), 85.4);
      assert.equal(ProgressPolicyService.average([100]), 100);
      assert.equal(ProgressPolicyService.average([0]), 0);
    });

    it('toàn bộ giá trị 0% hoặc toàn bộ 100%', () => {
      assert.equal(ProgressPolicyService.average([0, 0, 0]), 0);
      assert.equal(ProgressPolicyService.average([100, 100, 100]), 100);
    });

    it('quy tắc làm tròn số học (round half-up tại 1 chữ số thập phân)', () => {
      // 70.04 làm tròn xuống 70
      assert.equal(ProgressPolicyService.average([70.04]), 70);
      // 70.05 làm tròn lên 70.1
      assert.equal(ProgressPolicyService.average([70.05]), 70.1);
      // 70.06 làm tròn lên 70.1
      assert.equal(ProgressPolicyService.average([70.06]), 70.1);
    });

    it('phép chia vô hạn tuần hoàn (1/3, 2/3)', () => {
      // (10 + 20 + 20) / 3 = 16.666... -> 16.7
      assert.equal(ProgressPolicyService.average([10, 20, 20]), 16.7);
      // (10 + 10 + 20) / 3 = 13.333... -> 13.3
      assert.equal(ProgressPolicyService.average([10, 10, 20]), 13.3);
    });
  });
});
