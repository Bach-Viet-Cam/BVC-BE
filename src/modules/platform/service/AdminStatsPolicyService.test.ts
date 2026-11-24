import assert from 'node:assert/strict';
import { test } from 'node:test';
import AdminStatsPolicyService from './AdminStatsPolicyService.ts';

const NOW = new Date('2026-10-16T05:00:00.000Z');
const OFFSET = 420;

test('UTC-ASP-001 - toPercent rounds to one decimal', () => {
  assert.equal(AdminStatsPolicyService.toPercent(1, 3), 33.3);
});

test('UTC-ASP-002 - toPercent with zero denominator and positive numerator', () => {
  assert.equal(AdminStatsPolicyService.toPercent(5, 0), 0);
});

test('UTC-ASP-003 - toPercent with both zero', () => {
  assert.equal(AdminStatsPolicyService.toPercent(0, 0), 0);
});

test('UTC-ASP-004 - day key shifts UTC+7 to next day', () => {
  assert.equal(AdminStatsPolicyService.toDayKey(new Date('2026-10-15T20:00:00.000Z'), OFFSET), '2026-10-16');
});

test('UTC-ASP-005 - day key stays on same day', () => {
  assert.equal(AdminStatsPolicyService.toDayKey(new Date('2026-10-16T05:00:00.000Z'), OFFSET), '2026-10-16');
});

test('UTC-ASP-006 - empty dates produce three zero counts', () => {
  assert.deepEqual(AdminStatsPolicyService.buildDailySeries([], 3, NOW, OFFSET), [
    { date: '2026-10-14', count: 0 },
    { date: '2026-10-15', count: 0 },
    { date: '2026-10-16', count: 0 }
  ]);
});

test('UTC-ASP-007 - group records by UTC+7 day', () => {
  const dates = [
    new Date('2026-10-16T01:00:00.000Z'),
    new Date('2026-10-15T20:00:00.000Z'),
    new Date('2026-10-14T10:00:00.000Z')
  ];
  const series = AdminStatsPolicyService.buildDailySeries(dates, 3, NOW, OFFSET);
  // R1: ghi [1,1,2] ở lần 1
  assert.deepEqual(series.map((entry) => entry.count), [1, 0, 2]);
});

test('UTC-ASP-008 - dates outside window are ignored', () => {
  const series = AdminStatsPolicyService.buildDailySeries(
    [new Date('2026-10-01T00:00:00.000Z')],
    3,
    NOW,
    OFFSET
  );
  assert.deepEqual(series, [
    { date: '2026-10-14', count: 0 },
    { date: '2026-10-15', count: 0 },
    { date: '2026-10-16', count: 0 }
  ]);
});

test('UTC-ASP-009 - no alerts when all below thresholds', () => {
  assert.deepEqual(AdminStatsPolicyService.buildAlerts({ storagePercent: 79.9, queueCount: 4, failed24h: 0 }), []);
});

test('UTC-ASP-010 - storage alert starts at 80 percent', () => {
  const alerts = AdminStatsPolicyService.buildAlerts({ storagePercent: 80, queueCount: 0, failed24h: 0 });
  // R1: lưu ý 80 là vào ngưỡng; pass ở vòng 3
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].level, 'WARN');
  assert.equal(alerts[0].code, 'storage_high');
});

test('UTC-ASP-011 - queue alert starts at five recordings', () => {
  const alerts = AdminStatsPolicyService.buildAlerts({ storagePercent: 0, queueCount: 5, failed24h: 0 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].level, 'WARN');
  assert.equal(alerts[0].code, 'queue_deep');
});

test('UTC-ASP-012 - failed analysis is an ERROR with count', () => {
  assert.deepEqual(AdminStatsPolicyService.buildAlerts({ storagePercent: 0, queueCount: 0, failed24h: 2 }), [
    {
      level: 'ERROR',
      code: 'analysis_failed',
      message: '2 bản thu phân tích lỗi trong 24 giờ qua.'
    }
  ]);
});
