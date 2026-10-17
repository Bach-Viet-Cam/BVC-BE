import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import AudioRepository from './AudioRepository.ts';

const job: Audio.Job = { messageId: 'msg', evaluationId: 'eval', instrumentId: 'dan_bau', requestedAt: new Date().toISOString(), templateUrl: 'https://be.example.com/t.wav', studentUrl: 'https://be.example.com/s.wav' };

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
