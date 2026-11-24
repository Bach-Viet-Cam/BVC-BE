import { test } from 'node:test';
import assert from 'node:assert/strict';
import GradingSettingsService from './GradingSettingsService.ts';
import SettingsRepository from '../repository/SettingsRepository.ts';

const settingRow = (key: string, value: string, updatedAt: string) => ({
  key, value, updatedAt: new Date(updatedAt)
});

const bothRows = () => [
  settingRow('min_accuracy_default', '70', '2026-11-01T00:00:00.000Z'),
  settingRow('at_risk_margin', '10', '2026-11-02T00:00:00.000Z')
];

test('UTC-GSS-001 - returns both thresholds with the newer updatedAt', async (t) => {
  t.mock.method(SettingsRepository, 'findSettings', async () => bothRows());

  assert.deepEqual(await GradingSettingsService.getGradingSettings(), {
    minAccuracy: 70, atRiskMargin: 10, updatedAt: '2026-11-02T00:00:00.000Z'
  });
});

test('UTC-GSS-002 - missing min_accuracy_default throws 500', async (t) => {
  t.mock.method(SettingsRepository, 'findSettings', async () => [
    settingRow('at_risk_margin', '10', '2026-11-02T00:00:00.000Z')
  ]);

  await assert.rejects(
    () => GradingSettingsService.getGradingSettings(),
    { statusCode: 500, message: 'Thiếu cấu hình chấm điểm.' }
  );
});

test('UTC-GSS-003 - missing at_risk_margin throws 500', async (t) => {
  t.mock.method(SettingsRepository, 'findSettings', async () => [
    settingRow('min_accuracy_default', '70', '2026-11-01T00:00:00.000Z')
  ]);

  // R1: tưởng có fallback cứng
  await assert.rejects(
    () => GradingSettingsService.getGradingSettings(),
    { statusCode: 500, message: 'Thiếu cấu hình chấm điểm.' }
  );
});

test('UTC-GSS-004 - updatedAt comes from at_risk_margin when newer', async (t) => {
  t.mock.method(SettingsRepository, 'findSettings', async () => [
    settingRow('min_accuracy_default', '70', '2026-10-01T00:00:00.000Z'),
    settingRow('at_risk_margin', '10', '2026-11-09T00:00:00.000Z')
  ]);

  const result = await GradingSettingsService.getGradingSettings();
  assert.equal(result.updatedAt, '2026-11-09T00:00:00.000Z');
});

test('UTC-GSS-005 - caller transaction client is forwarded to repository', async (t) => {
  const client = {} as never;
  const findMock = t.mock.method(SettingsRepository, 'findSettings', async () => bothRows());

  await GradingSettingsService.getGradingSettings(client);

  assert.equal(findMock.mock.calls[0].arguments[1], client);
});
