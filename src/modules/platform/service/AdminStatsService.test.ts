import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdminStatsService from './AdminStatsService.ts';
import AdminStatsRepository from '../repository/AdminStatsRepository.ts';
import SystemConfigRepository from '../repository/SystemConfigRepository.ts';
import StorageUsageService from './StorageUsageService.ts';

const configRow = (value: string): Backend.SystemConfigRecord => ({
  id: 'cfg-1', key: 'storage_capacity_gb', value, valueType: 'NUMBER',
  group: 'FILE_LIMIT', label: 'Capacity', description: null
});

const stubStats = (t: any, now: Date, opts: {
  capacityBytes?: number;
  queueCount?: number;
  count7d?: number;
  failed7d?: number;
  failed24h?: number;
  queueRows?: Backend.SubmissionBrief[];
  failedRows?: Backend.SubmissionBrief[];
} = {}) => {
  const {
    capacityBytes = 0, queueCount = 0, count7d = 10,
    failed7d = 1, failed24h = 0, queueRows = [], failedRows = []
  } = opts;
  const since7d = now.getTime() - 7 * 86400000;

  t.mock.method(SystemConfigRepository, 'findByKey', async () => null);
  t.mock.method(StorageUsageService, 'measureUploads', async () => ({ usedBytes: capacityBytes, fileCount: 0 }));
  t.mock.method(AdminStatsRepository, 'countActiveUsersSince', async () => 5);
  t.mock.method(AdminStatsRepository, 'countActiveInstruments', async () => 2);
  t.mock.method(AdminStatsRepository, 'countProcessing', async () => queueCount);
  t.mock.method(AdminStatsRepository, 'listSubmissionDatesSince', async () => []);
  t.mock.method(AdminStatsRepository, 'listRecentUsers', async () => []);
  t.mock.method(AdminStatsRepository, 'listProcessing', async () => queueRows);
  t.mock.method(AdminStatsRepository, 'listFailed', async () => failedRows);
  t.mock.method(AdminStatsRepository, 'countSubmissionsSince', async (since: Date, status?: string) => {
    const is7d = since.getTime() === since7d;
    if (status === 'FAILED') return is7d ? failed7d : failed24h;
    return is7d ? count7d : 5;
  });
};

test('UTC-ADS-001 - subtractDays moves date back by 7 days', () => {
  const result = AdminStatsService.subtractDays(new Date('2026-11-17T00:00:00.000Z'), 7);

  assert.equal(result.toISOString(), '2026-11-10T00:00:00.000Z');
});

test('UTC-ADS-002 - getCapacityGb reads configured value', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow('20'));

  assert.equal(await AdminStatsService.getCapacityGb(), 20);
});

test('UTC-ADS-003 - getCapacityGb falls back on non numeric value', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow('abc'));

  assert.equal(await AdminStatsService.getCapacityGb(), 10);
});

test('UTC-ADS-004 - getCapacityGb falls back when config missing', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => null);

  assert.equal(await AdminStatsService.getCapacityGb(), 10);
});

test('UTC-ADS-005 - getCapacityGb falls back on zero', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow('0'));

  assert.equal(await AdminStatsService.getCapacityGb(), 10);
});

test('UTC-ADS-006 - getStorage computes capacityBytes and usedPercent', async (t) => {
  t.mock.method(StorageUsageService, 'measureUploads', async () => ({ usedBytes: 1024 ** 3, fileCount: 1 }));
  t.mock.method(SystemConfigRepository, 'findByKey', async () => configRow('2'));

  assert.deepEqual(await AdminStatsService.getStorage(), {
    usedBytes: 1073741824, capacityBytes: 2147483648, usedPercent: 50, fileCount: 1
  });
});

test('UTC-ADS-007 - getConfigSummary first row is active instrument count', async (t) => {
  t.mock.method(SystemConfigRepository, 'findByKey', async (key: string) => ({
    id: 'cfg', key, value: 'X', valueType: 'STRING', group: 'FILE_LIMIT', label: 'Label ' + key, description: null
  }));

  const result = await AdminStatsService.getConfigSummary(4);
  assert.deepEqual(result[0], { label: 'Nhạc cụ đang hoạt động', value: '4' });
});

test('UTC-ADS-008 - getConfigSummary drops null config rows', async (t) => {
  let call = 0;
  t.mock.method(SystemConfigRepository, 'findByKey', async () => (
    call++ === 0 ? null : configRow('5')
  ));

  const result = await AdminStatsService.getConfigSummary(2);
  assert.equal(result.length, 4);
  assert.ok(result.every((row) => typeof row.label === 'string' && typeof row.value === 'string'));
});

test('UTC-ADS-009 - getOverview builds 14 day series', async (t) => {
  const now = new Date('2026-11-17T00:00:00.000Z');
  stubStats(t, now);

  const result = await AdminStatsService.getOverview(now);
  assert.equal(result.submissionsByDay.length, 14);
});

test('UTC-ADS-010 - getOverview alerts include queue_deep', async (t) => {
  const now = new Date('2026-11-17T00:00:00.000Z');
  stubStats(t, now, {
    capacityBytes: Math.round(10 * 1024 ** 3 * 0.85),
    queueCount: 6,
    failed24h: 2
  });

  const result = await AdminStatsService.getOverview(now);
  // R1: thiếu queue_deep ở lần 1
  assert.deepEqual(result.alerts.map((alert) => alert.code), [
    'analysis_failed', 'storage_high', 'queue_deep'
  ]);
});

test('UTC-ADS-011 - getMonitoring computes errorRate7d', async (t) => {
  const now = new Date('2026-11-17T00:00:00.000Z');
  stubStats(t, now, { count7d: 10, failed7d: 2 });

  const result = await AdminStatsService.getMonitoring(now);
  assert.equal(result.errorRate7d, 20);
});

test('UTC-ADS-012 - getMonitoring maps queue row fields', async (t) => {
  const now = new Date('2026-11-17T00:00:00.000Z');
  const brief: Backend.SubmissionBrief = {
    id: 'sub-1',
    fileUrl: 'https://cdn/uploads/bai-1.wav',
    createdAt: new Date(now.getTime() - 10000),
    student: { username: 'SV1' },
    assignment: null,
    piece: { title: 'Bai 1' }
  };
  stubStats(t, now, { queueRows: [brief] });

  const result = await AdminStatsService.getMonitoring(now);
  assert.deepEqual(result.queue[0], {
    id: 'sub-1', fileName: 'bai-1.wav', studentName: 'SV1', waitSeconds: 10
  });
});
