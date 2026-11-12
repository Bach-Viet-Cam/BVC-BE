import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import AnalysisService from './AnalysisService.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import TemplateAnalysisPublisherService, { type TemplateAnalysisJob } from './TemplateAnalysisPublisherService.ts';

afterEach(() => mock.restoreAll());

const sheet = {
  id: 'sheet-1',
  kind: 'MAIN' as const,
  referenceAudio: { id: 'media-1', storageKey: 'media/teacher.wav', status: 'READY' },
  instrument: { code: 'DBA103', name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 }
};

test('requestAnalysis gửi khối instrument lấy từ bản ghi Instrument và giữ mã đã map', async () => {
  const jobs: TemplateAnalysisJob[] = [];
  mock.method(SheetMusicRepository, 'update', async () => undefined as never);
  mock.method(TemplateAnalysisPublisherService.instance, 'publish', async (job: TemplateAnalysisJob) => { jobs.push(job); return 'publish_failed' as const; });
  mock.method(SheetMusicRepository, 'updateIfJobMatches', async () => true as never);

  await AnalysisService.requestAnalysis(sheet);

  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].instrument, { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 });
  assert.equal(jobs[0].instrumentCode, 'dan_bau');
});
