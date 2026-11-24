import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import AudioConstant from '../constant/AudioConstant.ts';
import AudioEvaluationService from './AudioEvaluationService.ts';
import type AudioRepository from '../repository/AudioRepository.ts';
import type FileStorageService from '../../storage/service/FileStorageService.ts';
import type RhythmPublisherService from './RhythmPublisherService.ts';
import type RhythmClientService from './RhythmClientService.ts';

const storage = { provider: 'local' } as FileStorageService;
const input = { templateUrl: 'https://be.example.com/t.wav', studentUrl: 'https://be.example.com/s.wav' };
const instrument = { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Harness { service: AudioEvaluationService; job: () => Audio.Job | undefined; states: string[]; calls: { createArgs?: unknown[]; instrumentCode?: string } }

function createHarness(state: Audio.PublicationState, options: { updateFails?: boolean; instrument?: unknown } = {}): Harness {
  let captured: Audio.Job | undefined;
  const states: string[] = [];
  const calls: Harness['calls'] = {};
  const repository = {
    findInstrumentConfig: async (code: string) => { calls.instrumentCode = code; return 'instrument' in options ? options.instrument : instrument; },
    createRequest: async (...args: unknown[]) => { calls.createArgs = args; captured = args[2] as Audio.Job; },
    updatePublication: async (_id: string, s: string) => { if (options.updateFails) throw new Error('db down'); states.push(s); }
  } as unknown as AudioRepository;
  const publisher = { publish: async () => state } as unknown as RhythmPublisherService;
  return { service: new AudioEvaluationService(storage, publisher, repository), job: () => captured, states, calls };
}

function getService(record: { publicationState: string } | null, client: Partial<RhythmClientService>): AudioEvaluationService {
  const repository = { findRequest: async () => record && { evaluationId: 'ev-1', ownerId: 'owner', ...record } } as unknown as AudioRepository;
  return new AudioEvaluationService(storage, {} as RhythmPublisherService, repository, client as RhythmClientService);
}

describe('AudioEvaluationService.create (UTC-AD)', () => {
  it('UTC-AD-016 queued response and dan_bau job when publisher returns published', async () => {
    const h = createHarness('published');
    const res = await h.service.create('owner', input);
    assert.match(res.evaluationId, UUID);
    assert.deepEqual({ status: res.status, result: res.result, error: res.error }, { status: 'queued', result: null, error: null });
    assert.equal(h.job()?.instrumentId, 'dan_bau'); assert.notEqual(h.job()?.messageId, res.evaluationId);
    assert.equal(h.job()?.evaluationId, res.evaluationId); assert.deepEqual(h.states, ['published']);
  });
  it('UTC-AD-017 503 with details when publisher returns publish_failed', async () => {
    const h = createHarness('publish_failed');
    await assert.rejects(h.service.create('owner', input), (e: unknown) => e instanceof AppError && e.statusCode === 503
      && e.message === 'Không thể gửi yêu cầu vào hàng đợi. Vui lòng thử lại sau.'
      && e.details?.evaluationId === h.job()?.evaluationId && e.details?.status === 'publish_failed');
  });
  it('UTC-AD-018 503 with details when publisher returns publish_unknown', async () => {
    const h = createHarness('publish_unknown');
    await assert.rejects(h.service.create('owner', input), (e: unknown) => e instanceof AppError && e.statusCode === 503
      && e.message === 'Chưa xác định được yêu cầu đã vào hàng đợi. Hãy tiếp tục kiểm tra bằng mã đã tạo.'
      && e.details?.status === 'publish_unknown');
  });
  it('UTC-AD-019 503 publish_unknown when updatePublication throws after published', async () => {
    const h = createHarness('published', { updateFails: true });
    await assert.rejects(h.service.create('owner', input), (e: unknown) => e instanceof AppError && e.statusCode === 503
      && e.message === 'Chưa xác định được trạng thái gửi yêu cầu. Hãy kiểm tra lại bằng mã đã tạo.'
      && e.details?.status === 'publish_unknown' && e.details?.evaluationId === h.job()?.evaluationId);
  });
  // New cases
  it('UTC-AD-068 503 INSTRUMENT_NOT_CONFIGURED when no instrument row, nothing created or published', async () => {
    const h = createHarness('published', { instrument: null });
    await assert.rejects(h.service.create('owner', input), (e: unknown) => e instanceof AppError && e.statusCode === 503 && e.message === AudioConstant.messages.INSTRUMENT_NOT_CONFIGURED);
    assert.equal(h.calls.createArgs, undefined); assert.deepEqual(h.states, []);
  });
  it('UTC-AD-069 looks up the dan_bau instrument and persists request with owner, input and storage provider', async () => {
    const h = createHarness('published');
    await h.service.create('owner-9', input);
    assert.equal(h.calls.instrumentCode, 'dan_bau');
    assert.equal(h.calls.createArgs?.[0], 'owner-9'); assert.deepEqual(h.calls.createArgs?.[1], input); assert.equal(h.calls.createArgs?.[3], 'local');
    assert.deepEqual(h.job()?.instrument, instrument);
  });
  it('UTC-AD-070 job carries input URLs and an ISO requestedAt timestamp', async () => {
    const h = createHarness('published');
    await h.service.create('owner', input);
    assert.equal(h.job()?.templateUrl, input.templateUrl); assert.equal(h.job()?.studentUrl, input.studentUrl);
    assert.equal(new Date(h.job()!.requestedAt).toISOString(), h.job()!.requestedAt);
  });
  it('UTC-AD-071 each create generates a distinct evaluationId', async () => {
    const h = createHarness('published');
    const a = await h.service.create('owner', input); const b = await h.service.create('owner', input);
    assert.notEqual(a.evaluationId, b.evaluationId);
  });
  it('UTC-AD-072 persists the publication state returned by publisher before throwing (publish_failed)', async () => {
    const h = createHarness('publish_failed');
    await assert.rejects(h.service.create('owner', input));
    assert.deepEqual(h.states, ['publish_failed']);
  });
});

describe('AudioEvaluationService.get (UTC-AD)', () => {
  it('UTC-AD-020 returns the Rhythm response as is when available', async () => {
    const completed = { evaluationId: 'ev-1', status: 'completed', result: { overallScore: 80, pitchAccuracyPercent: 75, rhythmAccuracyPercent: 90, aiFeedback: 'ok' }, error: null };
    assert.deepEqual(await getService({ publicationState: 'published' }, { get: async () => completed as Audio.EvaluationResponse }).get('owner', 'ev-1'), completed);
  });
  it('UTC-AD-021 queued when published and Rhythm returns null', async () => {
    assert.deepEqual(await getService({ publicationState: 'published' }, { get: async () => null }).get('owner', 'ev-1'), { evaluationId: 'ev-1', status: 'queued', result: null, error: null });
  });
  it('UTC-AD-022 publish_unknown state is surfaced when Rhythm returns null', async () => {
    assert.equal((await getService({ publicationState: 'publish_unknown' }, { get: async () => null }).get('owner', 'ev-1')).status, 'publish_unknown');
  });
  it('UTC-AD-023 publish_failed is returned without calling Rhythm', async () => {
    let calls = 0;
    const res = await getService({ publicationState: 'publish_failed' }, { get: async () => { calls += 1; return null; } }).get('owner', 'ev-1');
    assert.equal(res.status, 'publish_failed'); assert.equal(calls, 0);
  });
  it('UTC-AD-024 404 when evaluation belongs to another owner', async () => {
    await assert.rejects(getService(null, { get: async () => null }).get('other', 'ev-1'),
      (e: unknown) => e instanceof AppError && e.statusCode === 404 && e.message === 'Không tìm thấy yêu cầu phân tích.');
  });
  // New cases
  it('UTC-AD-073 propagates 503 raised by the Rhythm client', async () => {
    const service = getService({ publicationState: 'published' }, { get: async () => { throw new AppError('Chưa thể lấy kết quả phân tích. Vui lòng thử kiểm tra lại.', 503); } });
    await assert.rejects(service.get('owner', 'ev-1'), (e: unknown) => e instanceof AppError && e.statusCode === 503);
  });
  it('UTC-AD-074 does not call Rhythm when the evaluation is not found', async () => {
    let calls = 0;
    await assert.rejects(getService(null, { get: async () => { calls += 1; return null; } }).get('owner', 'ev-1'));
    assert.equal(calls, 0);
  });
  it('UTC-AD-075 passes the evaluation id to the Rhythm client', async () => {
    let seen = '';
    await getService({ publicationState: 'published' }, { get: async (id: string) => { seen = id; return null; } }).get('owner', 'ev-1');
    assert.equal(seen, 'ev-1');
  });
});
