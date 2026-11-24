import assert from 'node:assert/strict';
import { test } from 'node:test';
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

function validate(key: string, valueType: Backend.ConfigValueType, nextValue: string) {
  return SystemConfigPolicyService.validate({ key, valueType, nextValue, current });
}

test('UTC-SCP-001 - reject non numeric value for NUMBER', () => {
  assert.deepEqual(validate('min_accuracy_default', 'NUMBER', 'abc'), {
    isValid: false,
    message: 'Giá trị phải là một số.'
  });
});

test('UTC-SCP-002 - reject percent above 100', () => {
  // R1: expected ghi nhầm 100; pass ở vòng 3
  assert.deepEqual(validate('at_risk_margin', 'NUMBER', '101'), {
    isValid: false,
    message: 'Giá trị phải nằm trong khoảng 0 đến 100.'
  });
});

test('UTC-SCP-003 - reject non integer for integer key', () => {
  // R1: lần 1 ghi sai message
  assert.deepEqual(validate('practice_min_per_week', 'NUMBER', '2.5'), {
    isValid: false,
    message: 'Giá trị phải là số nguyên.'
  });
});

test('UTC-SCP-004 - at risk margin must be below min accuracy', () => {
  const result = SystemConfigPolicyService.validateRelations({
    min_accuracy_default: '70',
    at_risk_margin: '70',
    threshold_excellent: '90',
    threshold_good: '75',
    threshold_pass: '50'
  });
  assert.deepEqual(result, {
    isValid: false,
    message: 'Biên "Có nguy cơ" phải nhỏ hơn accuracy tối thiểu.'
  });
});

test('UTC-SCP-005 - reject zero size', () => {
  assert.deepEqual(validate('max_recording_mb', 'NUMBER', '0'), {
    isValid: false,
    message: 'Giá trị phải lớn hơn 0.'
  });
});

test('UTC-SCP-006 - accept positive size', () => {
  assert.deepEqual(validate('max_recording_mb', 'NUMBER', '25'), { isValid: true });
});

test('UTC-SCP-007 - reject negative percent', () => {
  // R1: quên không thử số âm; pass ở vòng 3
  assert.deepEqual(validate('min_accuracy_default', 'NUMBER', '-1'), {
    isValid: false,
    message: 'Giá trị phải nằm trong khoảng 0 đến 100.'
  });
});

test('UTC-SCP-008 - accept percent upper bound 100', () => {
  assert.deepEqual(validate('min_accuracy_default', 'NUMBER', '100'), { isValid: true });
});

test('UTC-SCP-009 - accept positive integer submission limit', () => {
  assert.deepEqual(validate('default_max_submissions', 'NUMBER', '3'), { isValid: true });
});

test('UTC-SCP-010 - reject boolean like yes', () => {
  assert.deepEqual(validate('some_flag', 'BOOLEAN', 'yes'), {
    isValid: false,
    message: 'Giá trị phải là true hoặc false.'
  });
});

test('UTC-SCP-011 - accept boolean true', () => {
  assert.deepEqual(validate('some_flag', 'BOOLEAN', 'true'), { isValid: true });
});

test('UTC-SCP-012 - reject whitespace only string', () => {
  // R1: tưởng trim xong vẫn hợp lệ
  assert.deepEqual(validate('some_label', 'STRING', '   '), {
    isValid: false,
    message: 'Giá trị không được để trống.'
  });
});

test('UTC-SCP-013 - accept non empty string array', () => {
  assert.deepEqual(validate('allowed_recording_formats', 'JSON', '["mp3"]'), { isValid: true });
});

test('UTC-SCP-014 - reject empty string array', () => {
  assert.deepEqual(validate('allowed_recording_formats', 'JSON', '[]'), {
    isValid: false,
    message: 'Giá trị phải là danh sách chuỗi không rỗng, ví dụ ["mp3","wav"].'
  });
});

test('UTC-SCP-015 - reject array with non string item', () => {
  assert.deepEqual(validate('allowed_recording_formats', 'JSON', '[1]'), {
    isValid: false,
    message: 'Giá trị phải là danh sách chuỗi không rỗng, ví dụ ["mp3","wav"].'
  });
});

test('UTC-SCP-016 - reject invalid JSON array', () => {
  // R1: nhầm với message mảng rỗng
  assert.deepEqual(validate('allowed_recording_formats', 'JSON', 'mp3'), {
    isValid: false,
    message: 'Giá trị phải là JSON hợp lệ.'
  });
});

test('UTC-SCP-017 - accept valid semester list', () => {
  const semesters = '[{"name":"FA26","startDate":"2026-09-07","endDate":"2026-12-27"}]';
  assert.deepEqual(validate('class.semesters', 'JSON', semesters), { isValid: true });
});

test('UTC-SCP-018 - reject empty semester list', () => {
  assert.deepEqual(validate('class.semesters', 'JSON', '[]'), {
    isValid: false,
    message: 'Danh sách học kỳ không được để trống, ví dụ [{"name":"FA26","startDate":"2026-09-07","endDate":"2026-12-27"}].'
  });
});

test('UTC-SCP-019 - reject duplicated semester name ignoring case', () => {
  const semesters = '[{"name":"fa26","startDate":"2026-09-07","endDate":"2026-12-27"},{"name":"FA26","startDate":"2027-01-04","endDate":"2027-04-25"}]';
  assert.deepEqual(validate('class.semesters', 'JSON', semesters), {
    isValid: false,
    message: 'Học kỳ thứ 2: tên "FA26" bị trùng.'
  });
});

test('UTC-SCP-020 - reject start date after end date', () => {
  // R1: tưởng so chuỗi sẽ tự đúng
  const semesters = '[{"name":"FA26","startDate":"2026-12-28","endDate":"2026-12-27"}]';
  assert.deepEqual(validate('class.semesters', 'JSON', semesters), {
    isValid: false,
    message: 'Học kỳ thứ 1: ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'
  });
});
