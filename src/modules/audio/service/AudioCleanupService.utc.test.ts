import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import AudioConstant from '../constant/AudioConstant.ts';
import AudioCleanupService from './AudioCleanupService.ts';
import type AudioRepository from '../repository/AudioRepository.ts';
import type FileStorageService from '../../storage/service/FileStorageService.ts';

type Orphan = { id: string; provider: string; key: string };

function setup(orphans: Orphan[], failDelete: string[] = [], failRepoDelete: string[] = []) {
  const deleted: string[] = []; const claimedDeleted: string[] = []; const cutoffs: Date[] = [];
  const storage = { provider: 'local', delete: async (key: string) => { if (failDelete.includes(key)) throw new Error('x'); deleted.push(key); } } as unknown as FileStorageService;
  const repository = {
    claimOrphans: async (before: Date) => { cutoffs.push(before); return orphans; },
    deleteClaimedUpload: async (id: string) => { if (failRepoDelete.includes(id)) throw new Error('db'); claimedDeleted.push(id); }
  } as unknown as AudioRepository;
  return { service: new AudioCleanupService(storage, repository), deleted, claimedDeleted, cutoffs };
}

describe('AudioCleanupService.run (UTC-AD)', () => {
  afterEach(() => mock.restoreAll());

  it('UTC-AD-025 deletes local orphans, skips other provider, returns 2', async () => {
    const h = setup([{ id: '1', provider: 'local', key: 'a' }, { id: '2', provider: 'local', key: 'b' }, { id: '3', provider: 's3', key: 'c' }]);
    assert.equal(await h.service.run(), 2);
    assert.deepEqual(h.deleted, ['a', 'b']); assert.deepEqual(h.claimedDeleted, ['1', '2']);
  });
  it('UTC-AD-026 counts only successes and logs a message when storage.delete throws', async () => {
    const errorLog = mock.method(console, 'error', () => undefined);
    const h = setup([{ id: '1', provider: 'local', key: 'a' }, { id: '2', provider: 'local', key: 'b' }], ['a']);
    assert.equal(await h.service.run(), 1);
    assert.equal(errorLog.mock.calls[0].arguments[0], 'Không thể dọn một file audio hết hạn.');
    assert.deepEqual(h.claimedDeleted, ['2']);
  });
  it('UTC-AD-027 returns 0 when there are no orphans', async () => {
    const h = setup([]);
    assert.equal(await h.service.run(), 0); assert.deepEqual(h.deleted, []);
  });
  // New cases
  it('UTC-AD-076 claims orphans older than the 24h retention window', async () => {
    const h = setup([]);
    const before = Date.now();
    await h.service.run();
    const after = Date.now();
    const cutoff = h.cutoffs[0].getTime();
    assert.ok(cutoff >= before - AudioConstant.orphanRetentionMs && cutoff <= after - AudioConstant.orphanRetentionMs);
  });
  it('UTC-AD-077 does not count an upload whose DB row removal fails and logs the message', async () => {
    const errorLog = mock.method(console, 'error', () => undefined);
    const h = setup([{ id: '1', provider: 'local', key: 'a' }], [], ['1']);
    assert.equal(await h.service.run(), 0);
    assert.equal(errorLog.mock.calls[0].arguments[0], 'Không thể dọn một file audio hết hạn.');
    assert.deepEqual(h.deleted, ['a']);
  });
  it('UTC-AD-078 skips orphans of a different provider without touching storage or DB', async () => {
    const h = setup([{ id: '3', provider: 's3', key: 'c' }]);
    assert.equal(await h.service.run(), 0);
    assert.deepEqual(h.deleted, []); assert.deepEqual(h.claimedDeleted, []);
  });
  it('UTC-AD-079 continues with remaining orphans after the first failure', async () => {
    mock.method(console, 'error', () => undefined);
    const h = setup([{ id: '1', provider: 'local', key: 'a' }, { id: '2', provider: 'local', key: 'b' }, { id: '3', provider: 'local', key: 'c' }], ['a']);
    assert.equal(await h.service.run(), 2);
    assert.deepEqual(h.deleted, ['b', 'c']);
  });
});
