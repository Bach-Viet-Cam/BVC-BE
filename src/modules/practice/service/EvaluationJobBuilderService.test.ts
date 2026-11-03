import { test } from 'node:test';
import assert from 'node:assert/strict';
import EvaluationJobBuilderService from './EvaluationJobBuilderService.ts';

const now = new Date('2026-11-03T10:00:00Z');
const sheet: Practice.SheetTemplate = {
  id: 'sheet-bau', pieceId: 'piece-1', instrumentId: 'inst-bau', kind: 'MAIN', analysisStatus: 'READY', analysisJobId: 'analysis-1',
  referenceAudio: { storageKey: 'media/teacher.wav', status: 'READY' }, instrument: { code: 'dan_bau' }
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
