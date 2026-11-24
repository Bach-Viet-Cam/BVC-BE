import { test } from 'node:test';
import assert from 'node:assert/strict';
import SystemConfigService from './SystemConfigService.ts';
import SystemConfigRepository from '../repository/SystemConfigRepository.ts';

const configRow = (overrides: Partial<Backend.SystemConfigRecord> = {}): Backend.SystemConfigRecord => ({
  id: 'cfg-1',
  key: 'min_accuracy_default',
  value: '70',
  valueType: 'NUMBER',
  group: 'SCORING',
  label: 'Accuracy',
  description: null,
  ...overrides
});

test('UTC-SCS-001 - list maps repository rows through DTO', async (t) => {
  const query: Backend.SystemConfigListQuery = { sortBy: 'label', sortDir: 'asc' };
  const listMock = t.mock.method(SystemConfigRepository, 'list', async () => [configRow()]);

  const result = await SystemConfigService.list(query);

  assert.equal(listMock.mock.calls.length, 1);
  assert.deepEqual(result, [{
    id: 'cfg-1', key: 'min_accuracy_default', value: '70', valueType: 'NUMBER',
    group: 'SCORING', label: 'Accuracy', description: null
  }]);
});

test('UTC-SCS-002 - missing config on updateValue returns 404', async (t) => {
  t.mock.method(SystemConfigRepository, 'findById', async () => null);

  // R1: ghi 400 ở lần 1
  await assert.rejects(
    () => SystemConfigService.updateValue('missing', '70', 'admin-1'),
    { statusCode: 404, message: 'Không tìm thấy tham số hệ thống.' }
  );
});

test('UTC-SCS-003 - non numeric value returns 400', async (t) => {
  t.mock.method(SystemConfigRepository, 'findById', async () => configRow({ valueType: 'NUMBER' }));
  t.mock.method(SystemConfigRepository, 'listAll', async () => []);

  await assert.rejects(
    () => SystemConfigService.updateValue('cfg-1', 'abc', 'admin-1'),
    { statusCode: 400, message: 'Giá trị phải là một số.' }
  );
});

test('UTC-SCS-004 - valid update returns DTO item', async (t) => {
  t.mock.method(SystemConfigRepository, 'findById', async () => configRow({ valueType: 'NUMBER' }));
  t.mock.method(SystemConfigRepository, 'listAll', async () => [
    configRow({ id: 'cfg-2', key: 'at_risk_margin', value: '10' })
  ]);
  const updateMock = t.mock.method(SystemConfigRepository, 'updateValue', async () => configRow({ value: '25' }));

  const result = await SystemConfigService.updateValue('cfg-1', '25', 'admin-1');

  assert.equal(updateMock.mock.calls[0].arguments[2], 'admin-1');
  assert.deepEqual(result, {
    id: 'cfg-1', key: 'min_accuracy_default', value: '25', valueType: 'NUMBER',
    group: 'SCORING', label: 'Accuracy', description: null
  });
});

test('UTC-SCS-005 - at_risk_margin must be below min_accuracy', async (t) => {
  t.mock.method(SystemConfigRepository, 'findById', async () => configRow({ valueType: 'NUMBER' }));
  t.mock.method(SystemConfigRepository, 'listAll', async () => [
    configRow({ id: 'cfg-2', key: 'at_risk_margin', value: '70' })
  ]);

  // R1: quên truyền current vào validate
  await assert.rejects(
    () => SystemConfigService.updateValue('cfg-1', '60', 'admin-1'),
    { statusCode: 400, message: 'Biên "Có nguy cơ" phải nhỏ hơn accuracy tối thiểu.' }
  );
});

test('UTC-SCS-006 - getNumber parses stored value', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow({ value: '70', valueType: 'NUMBER' }));

  assert.equal(await SystemConfigService.getNumber('min_accuracy_default'), 70);
});

test('UTC-SCS-007 - getNumber missing config returns 404', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => null);

  await assert.rejects(
    () => SystemConfigService.getNumber('missing'),
    { statusCode: 404, message: 'Không tìm thấy tham số hệ thống.' }
  );
});

test('UTC-SCS-008 - getStringList parses JSON array', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow({ value: '["mp3","wav"]', valueType: 'JSON' }));

  assert.deepEqual(await SystemConfigService.getStringList('allowed_formats'), ['mp3', 'wav']);
});

test('UTC-SCS-009 - getStringList non array value returns empty list', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow({ value: '{"a":1}', valueType: 'JSON' }));

  assert.deepEqual(await SystemConfigService.getStringList('allowed_formats'), []);
});

test('UTC-SCS-010 - getSemesters ignores malformed dates', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow({
    value: '[{"name":"FA26","startDate":"abc","endDate":"2026-12-27"}]',
    valueType: 'JSON'
  }));

  assert.deepEqual(await SystemConfigService.getSemesters(), []);
});
