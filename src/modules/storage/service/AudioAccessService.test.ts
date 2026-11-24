import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import AudioAccessRepository from '../repository/AudioAccessRepository.ts';
import AudioAccessService from './AudioAccessService.ts';
import SignedFileUrlService from './SignedFileUrlService.ts';

const user = (userId: string, role: number) => ({ userId, role } as Backend.UserDTO);
const KEY = 'audio/0b8e4c6e-8f4a-4f3a-9a62-1f2b3c4d5e6f.wav';

afterEach(() => mock.restoreAll());

describe('AudioAccessService.check: student recordings (AD-010)', () => {
  const recording = () => mock.method(AudioAccessRepository, 'findUpload', async () => ({ ownerId: 'sv-1', lecturerIds: ['gv-a'] }));

  it('Guest must log in', async () => {
    recording();
    assert.equal(await AudioAccessService.check(KEY, null), 'LOGIN_REQUIRED');
  });
  it('owner, lecturer of the class and admin may open it', async () => {
    recording();
    assert.equal(await AudioAccessService.check(KEY, user('sv-1', 1)), 'ALLOWED');
    assert.equal(await AudioAccessService.check(KEY, user('gv-a', 2)), 'ALLOWED');
    assert.equal(await AudioAccessService.check(KEY, user('ad-1', 3)), 'ALLOWED');
  });
  it('another student or another lecturer may not', async () => {
    recording();
    assert.equal(await AudioAccessService.check(KEY, user('sv-2', 1)), 'DENIED');
    assert.equal(await AudioAccessService.check(KEY, user('gv-b', 2)), 'DENIED');
  });
});

describe('AudioAccessService.check: reference recordings', () => {
  const reference = (isPublic: boolean) => {
    mock.method(AudioAccessRepository, 'findUpload', async () => null);
    mock.method(AudioAccessRepository, 'findReference', async () => ({ uploadedById: 'gv-a', isPublic, pieceIds: ['p1'], pieceOwnerIds: ['gv-a'] }));
  };

  it('a public main recording is open to everyone', async () => {
    reference(true);
    assert.equal(await AudioAccessService.check(KEY, null), 'PUBLIC');
  });
  it('a hidden one needs the owner, an admin or a student whose class was assigned the piece', async () => {
    reference(false);
    const assigned = mock.method(AudioAccessRepository, 'isAssignedToStudent', async (studentId: string) => studentId === 'sv-1');
    assert.equal(await AudioAccessService.check(KEY, null), 'LOGIN_REQUIRED');
    assert.equal(await AudioAccessService.check(KEY, user('gv-a', 2)), 'ALLOWED');
    assert.equal(await AudioAccessService.check(KEY, user('ad-1', 3)), 'ALLOWED');
    assert.equal(await AudioAccessService.check(KEY, user('sv-1', 1)), 'ALLOWED');
    assert.equal(await AudioAccessService.check(KEY, user('sv-2', 1)), 'DENIED');
    assert.equal(await AudioAccessService.check(KEY, user('gv-b', 2)), 'DENIED');
    assert.equal(assigned.mock.callCount(), 2);
  });
  it('an unknown key is denied', async () => {
    mock.method(AudioAccessRepository, 'findUpload', async () => null);
    mock.method(AudioAccessRepository, 'findReference', async () => null);
    assert.equal(await AudioAccessService.check(KEY, user('ad-1', 3)), 'DENIED');
  });
});

describe('SignedFileUrlService', () => {
  it('signs audio URLs and verifies them until they expire', () => {
    const now = 1_800_000_000_000;
    const signed = new URL(SignedFileUrlService.sign(`http://be.local/uploads/${KEY}`, now));
    const [exp, sig] = [signed.searchParams.get('exp'), signed.searchParams.get('sig')];
    assert.equal(SignedFileUrlService.verify(KEY, exp, sig, now), true);
    assert.equal(SignedFileUrlService.verify(KEY.toUpperCase(), exp, sig, now), true);
    assert.equal(SignedFileUrlService.verify(KEY, exp, sig, now + SignedFileUrlService.ttlMs + 1000), false);
    assert.equal(SignedFileUrlService.verify(KEY.replace('.wav', '.mp3'), exp, sig, now), false);
    assert.equal(SignedFileUrlService.verify(KEY, String(Number(exp) + 60), sig, now), false);
    assert.equal(SignedFileUrlService.verify(KEY, undefined, sig, now), false);
  });
  it('leaves other files unchanged', () => {
    assert.equal(SignedFileUrlService.sign('http://be.local/uploads/sheet/2026-11/a.pdf'), 'http://be.local/uploads/sheet/2026-11/a.pdf');
    assert.equal(SignedFileUrlService.sign('https://cdn.example.com/a.wav'), 'https://cdn.example.com/a.wav');
  });
});
