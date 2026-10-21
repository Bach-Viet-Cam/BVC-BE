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
});

describe('ProgressPolicyService.average', () => {
  it('trả null khi danh sách rỗng', () => {
    assert.equal(ProgressPolicyService.average([]), null);
  });
  it('tính trung bình và làm tròn 1 chữ số', () => {
    assert.equal(ProgressPolicyService.average([91, 88, 92]), 90.3);
  });
});
