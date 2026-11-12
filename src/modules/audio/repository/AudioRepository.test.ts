import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import AudioRepository from './AudioRepository.ts';

const job: Audio.Job = { messageId: 'msg', evaluationId: 'eval', instrumentId: 'dan_bau', instrument: { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 }, requestedAt: new Date().toISOString(), templateUrl: 'https://be.example.com/t.wav', studentUrl: 'https://be.example.com/s.wav' };

test('Repository chỉ chọn upload đúng owner/provider và chưa bị cleanup claim', async () => {
  let created = false;
  let allowBoth = false;
  let locked = false;
  const transaction = {
    $queryRaw: async () => { locked = true; },
    audioUpload: { findMany: async ({ where }: { where: { ownerId: string; provider: string; deletingAt: null } }) => {
      assert.equal(locked, true); assert.equal(where.ownerId, 'owner'); assert.equal(where.provider, 'local'); assert.equal(where.deletingAt, null);
      return [{ id: 't', url: job.templateUrl }, ...(allowBoth ? [{ id: 's', url: job.studentUrl }] : [])];
    } },
    audioEvaluationRequest: { create: async ({ data }: { data: { templateUploadId: string; studentUploadId: string } }) => {
      assert.equal(data.templateUploadId, 't'); assert.equal(data.studentUploadId, 's'); created = true;
    } }
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction) } as unknown as PrismaClient;
  const repository = new AudioRepository(client);
  await assert.rejects(repository.createRequest('owner', job, job, 'local'));
  assert.equal(created, false);
  allowBoth = true; await repository.createRequest('owner', job, job, 'local'); assert.equal(created, true);
});

test('findInstrumentConfig tìm Instrument theo mọi mã của nhạc cụ Rhythm và chỉ lấy 4 trường cấu hình', async () => {
  let captured: { where: { code: { in: string[] }; isActive: boolean }; select: Record<string, boolean> } | undefined;
  const client = { instrument: { findFirst: async (args: NonNullable<typeof captured>) => {
    captured = args;
    return { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 };
  } } } as unknown as PrismaClient;
  const config = await new AudioRepository(client).findInstrumentConfig('dan_bau');
  assert.deepEqual(config, { name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35 });
  for (const code of ['DBA', 'DBA103', 'DAN_BAU', 'dan-bau', 'dan_bau']) assert.ok(captured?.where.code.in.includes(code), code);
  assert.equal(captured?.where.isActive, true);
  assert.deepEqual(Object.keys(captured?.select ?? {}).sort(), ['fmaxHz', 'fminHz', 'name', 'toleranceCents']);
});

test('findInstrumentConfig trả null khi chưa có dòng Instrument', async () => {
  const client = { instrument: { findFirst: async () => null } } as unknown as PrismaClient;
  assert.equal(await new AudioRepository(client).findInstrumentConfig('dan_bau'), null);
});
