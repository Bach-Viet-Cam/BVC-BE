import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import AudioEvaluationService from './AudioEvaluationService.ts';
import AudioConstant from '../constant/AudioConstant.ts';
import type AudioRepository from '../repository/AudioRepository.ts';
import type FileStorageService from '../../storage/service/FileStorageService.ts';
import type RhythmPublisherService from './RhythmPublisherService.ts';
import type RhythmClientService from './RhythmClientService.ts';

const storage = { provider: 'local' } as FileStorageService;
const input = { templateUrl: 'https://be.example.com/t.wav', studentUrl: 'https://be.example.com/s.wav' };

test('Job cố định đàn bầu và lỗi publish trả lại ID để kiểm tra', async () => {
  let captured: Audio.Job | undefined;
  const states: string[] = [];
  const repository = {
    findInstrumentConfig: async () => ({ name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 }),
    createRequest: async (_owner: string, _input: Audio.EvaluationInput, job: Audio.Job) => { captured = job; },
    updatePublication: async (_id: string, state: string) => { states.push(state); }
  } as unknown as AudioRepository;
  for (const state of ['published', 'publish_unknown', 'publish_failed'] as const) {
    const publisher = { publish: async () => state } as unknown as RhythmPublisherService;
    const service = new AudioEvaluationService(storage, publisher, repository);
    if (state === 'published') assert.equal((await service.create('owner', input)).status, 'queued');
    else await assert.rejects(service.create('owner', input), (error) => error instanceof AppError && error.details?.evaluationId === captured?.evaluationId && error.details?.status === state);
    assert.equal(captured?.instrumentId, 'dan_bau'); assert.equal(captured?.templateUrl, input.templateUrl);
    assert.deepEqual(captured?.instrument, { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 });
    assert.notEqual(captured?.messageId, captured?.evaluationId);
  }
  assert.deepEqual(states, ['published', 'publish_unknown', 'publish_failed']);
});

test('Kiểm tra quyền trước khi gọi Rhythm và xử lý 404 ban đầu thành queued', async () => {
  let calls = 0;
  const client = { get: async () => { calls += 1; return null; } } as unknown as RhythmClientService;
  let owner = true;
  const repository = { findRequest: async () => owner ? { evaluationId: 'eval-1', ownerId: 'owner', publicationState: 'published' } : null } as unknown as AudioRepository;
  const service = new AudioEvaluationService(storage, {} as RhythmPublisherService, repository, client);
  assert.equal((await service.get('owner', 'eval-1')).status, 'queued');
  owner = false;
  await assert.rejects(service.get('other', 'eval-1'), (error) => error instanceof AppError && error.statusCode === 404);
  assert.equal(calls, 1);
});

test('Chưa có dòng Instrument cho Đàn bầu thì trả 503, không tạo yêu cầu và không publish', async () => {
  let created = 0; let published = 0;
  const repository = { findInstrumentConfig: async () => null, createRequest: async () => { created += 1; } } as unknown as AudioRepository;
  const publisher = { publish: async () => { published += 1; return 'published'; } } as unknown as RhythmPublisherService;
  const service = new AudioEvaluationService(storage, publisher, repository);
  await assert.rejects(service.create('owner', input), (error) => error instanceof AppError && error.statusCode === 503 && error.message === AudioConstant.messages.INSTRUMENT_NOT_CONFIGURED);
  assert.equal(created, 0); assert.equal(published, 0);
});
