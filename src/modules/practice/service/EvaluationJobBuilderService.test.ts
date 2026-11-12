import { test } from 'node:test';
import assert from 'node:assert/strict';
import EvaluationJobBuilderService from './EvaluationJobBuilderService.ts';

const now = new Date('2026-11-03T10:00:00Z');
const sheet: Practice.SheetTemplate = {
  id: 'sheet-bau', pieceId: 'piece-1', instrumentId: 'inst-bau', kind: 'MAIN', analysisStatus: 'READY', analysisJobId: 'analysis-1',
  referenceAudio: { storageKey: 'media/teacher.wav', status: 'READY' }, instrument: { code: 'dan_bau', name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 }
};
const ids = { evaluationId: 'ev', messageId: 'm', attempt: 1 };

function builder(): EvaluationJobBuilderService {
  return new EvaluationJobBuilderService(async (key) => `https://s/${key}`, () => now);
}

test('build gắn templateAnalysisId khi bản mẫu READY và callbackUrl theo path', async () => {
  const job = await builder().build(sheet, ids, 'https://be/s.wav', '/api/v1/x');
  assert.equal(job.templateUrl, 'https://s/media/teacher.wav');
  assert.equal(job.studentUrl, 'https://be/s.wav');
  assert.equal(job.instrumentId, 'dan_bau');
  assert.equal(job.templateAnalysisId, 'analysis-1');
  assert.equal(job.requestedAt, now.toISOString());
  assert.ok(job.callbackUrl?.endsWith('/api/v1/x'));
});

test('build bỏ templateAnalysisId khi bản mẫu chưa READY', async () => {
  const job = await builder().build({ ...sheet, analysisStatus: 'PROCESSING' }, ids, 'https://be/s.wav', '/api/v1/x');
  assert.equal(job.templateAnalysisId, undefined);
});

test('build gắn khối instrument lấy từ sheet', async () => {
  const job = await builder().build(sheet, ids, 'https://be/s.wav', '/api/v1/x');
  assert.deepEqual(job.instrument, { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 });
  assert.equal(job.instrumentId, 'dan_bau');
});

test('build dùng cấu hình của sheet được nộp, không phải của lớp', async () => {
  const other = { ...sheet, instrument: { code: 'DTR103', name: 'Đàn tranh', fminHz: 98, fmaxHz: 1568, toleranceCents: 30 } };
  const job = await builder().build(other, ids, 'https://be/s.wav', '/api/v1/x');
  assert.deepEqual(job.instrument, { name: 'Đàn tranh', fminHz: 98, fmaxHz: 1568, toleranceCents: 30 });
  assert.equal(job.instrumentId, 'dan_tranh');
});
