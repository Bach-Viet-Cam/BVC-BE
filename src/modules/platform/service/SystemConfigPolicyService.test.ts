import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import SystemConfigPolicyService from './SystemConfigPolicyService.ts';

const current: Record<string, string> = {
  max_recording_mb: '20',
  allowed_recording_formats: '["mp3","wav","m4a"]',
  min_accuracy_default: '70',
  at_risk_margin: '10',
  threshold_excellent: '90',
  threshold_good: '80',
  threshold_pass: '70'
};

function validate(key: string, valueType: Backend.ConfigValueType, nextValue: string): { isValid: boolean; message?: string } {
  return SystemConfigPolicyService.validate({ key, valueType, nextValue, current });
}

describe('SystemConfigPolicyService.validate', () => {
  it('từ chối giá trị không phải số cho tham số NUMBER', () => {
    assert.equal(validate('max_recording_mb', 'NUMBER', 'abc').isValid, false);
  });
  it('từ chối dung lượng bằng 0', () => {
    assert.equal(validate('max_recording_mb', 'NUMBER', '0').isValid, false);
  });
  it('chấp nhận dung lượng hợp lệ', () => {
    assert.equal(validate('max_recording_mb', 'NUMBER', '25').isValid, true);
  });
  it('từ chối phần trăm ngoài 0-100 (GBR-33)', () => {
    assert.equal(validate('min_accuracy_default', 'NUMBER', '101').isValid, false);
    assert.equal(validate('min_accuracy_default', 'NUMBER', '-1').isValid, false);
  });
  it('từ chối biên có nguy cơ không nhỏ hơn accuracy tối thiểu (GBR-33)', () => {
    assert.equal(validate('at_risk_margin', 'NUMBER', '70').isValid, false);
    assert.equal(validate('at_risk_margin', 'NUMBER', '69').isValid, true);
  });
  it('từ chối nâng accuracy tối thiểu xuống thấp hơn biên có nguy cơ', () => {
    assert.equal(validate('min_accuracy_default', 'NUMBER', '10').isValid, false);
  });
  it('từ chối ngưỡng mức không giảm dần Xuất Sắc > Tốt > Đạt', () => {
    assert.equal(validate('threshold_good', 'NUMBER', '95').isValid, false);
    assert.equal(validate('threshold_good', 'NUMBER', '70').isValid, false);
    assert.equal(validate('threshold_good', 'NUMBER', '85').isValid, true);
  });
  it('JSON phải là mảng chuỗi', () => {
    assert.equal(validate('allowed_recording_formats', 'JSON', '["mp3"]').isValid, true);
    assert.equal(validate('allowed_recording_formats', 'JSON', 'mp3').isValid, false);
    assert.equal(validate('allowed_recording_formats', 'JSON', '[]').isValid, false);
    assert.equal(validate('allowed_recording_formats', 'JSON', '[1]').isValid, false);
  });
  it('số lần nộp phải là số nguyên dương', () => {
    assert.equal(validate('default_max_submissions', 'NUMBER', '2.5').isValid, false);
    assert.equal(validate('default_max_submissions', 'NUMBER', '3').isValid, true);
  });
  it('BOOLEAN chỉ nhận true/false', () => {
    assert.equal(validate('some_flag', 'BOOLEAN', 'yes').isValid, false);
    assert.equal(validate('some_flag', 'BOOLEAN', 'true').isValid, true);
  });
});
