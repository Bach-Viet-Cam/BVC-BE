import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import AppError from '../../../utils/AppError.ts';
import EnsembleRepository from '../repository/EnsembleRepository.ts';
import EnsemblePolicyService from './EnsemblePolicyService.ts';
import EnsembleService from './EnsembleService.ts';

const MSG_PIECE = 'Không tìm thấy bài nhạc.';
const MSG_MEMBER = 'Bạn chưa thuộc lớp học nào nên chưa thể luyện hòa tấu.';
const MSG_ASSIGN = 'Không thể mở bài tập vì bài tập không còn khả dụng.';
const MSG_TRACKS = 'Bài nhạc này chưa có track hòa tấu ảo nên chưa thể luyện cùng ensemble.';

const piece = (visibility: 'PUBLIC' | 'HIDDEN' = 'PUBLIC', moderation: 'NORMAL' | 'ADMIN_HIDDEN' = 'NORMAL', deletedAt: Date | null = null) => ({ visibility, moderation, deletedAt });

type Stub = Record<string, unknown>;
const repo = EnsembleRepository as unknown as Stub;
const original: Stub = {};
const names = ['findPiece', 'findTracks', 'findCurrentMembership', 'findEnrollments', 'findInstrumentName', 'findReadyMainSheetId'];
let calls: Record<string, unknown[][]>;

const DAY = 86_400_000;
const basePiece = () => ({ id: 'p1', title: 'Lưu thủy', bpm: 80, ...piece() });
const member = () => ({ classId: 'c1', instrumentId: 'i-tranh', instrument: { name: 'Đàn tranh' } });
const candidate = (over: Stub = {}) => ({
  id: 'as-e', title: 'Hòa tấu', description: '', status: 'PUBLISHED', deadline: new Date(Date.now() + 7 * DAY), maxSubmissions: null,
  targetBpm: 72, currentVersionId: 'v1', currentVersion: { kind: 'ENSEMBLE' }, submissions: [], ...over
});
const enrollment = (assignments: Stub[], over: Stub = {}) => ({
  classRecord: { id: 'c1', name: 'Lớp 1', status: 'ACTIVE', instrumentId: 'i-tranh' }, assignments, memberInstrumentId: 'i-tranh', ...over
});
const track = (id: string, instrumentId: string, name: string) => ({ id, instrumentId, fileUrl: `url-${id}`, durationSec: 10, offsetMs: 0, defaultVolume: 1, instrument: { name } });

function stub(impl: Stub) {
  for (const n of names) {
    repo[n] = async (...args: unknown[]) => {
      calls[n].push(args);
      if (!(n in impl)) throw new Error(`unexpected call ${n}`);
      const value = impl[n];
      return typeof value === 'function' ? (value as (...input: unknown[]) => unknown)(...args) : value;
    };
  }
}
async function rejects404(p: Promise<unknown>, status: number, message: string) {
  await assert.rejects(p, (e: unknown) => e instanceof AppError && e.statusCode === status && e.message === message);
}

beforeEach(() => {
  calls = Object.fromEntries(names.map((n) => [n, []]));
  for (const n of names) original[n] = repo[n];
});
afterEach(() => { for (const n of names) repo[n] = original[n]; });

describe('EnsemblePolicyService.canPracticePiece', () => {
  it('UTC-EN-001 public normal piece, free practice -> true', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece(), isViaAssignment: false }), true);
  });
  it('UTC-EN-002 hidden by lecturer: free false, via assignment true', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('HIDDEN'), isViaAssignment: false }), false);
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('HIDDEN'), isViaAssignment: true }), true);
  });
  it('UTC-EN-003 admin hidden or deleted via assignment -> false', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('PUBLIC', 'ADMIN_HIDDEN'), isViaAssignment: true }), false);
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('PUBLIC', 'NORMAL', new Date()), isViaAssignment: true }), false);
  });
  it('UTC-EN-020 admin hidden piece, free practice -> false', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('PUBLIC', 'ADMIN_HIDDEN'), isViaAssignment: false }), false);
  });
  it('UTC-EN-021 deleted piece, free practice -> false', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('PUBLIC', 'NORMAL', new Date()), isViaAssignment: false }), false);
  });
  it('UTC-EN-022 hidden + admin hidden + deleted via assignment -> false', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('HIDDEN', 'ADMIN_HIDDEN', new Date()), isViaAssignment: true }), false);
  });
  it('UTC-EN-023 public normal piece via assignment -> true', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece(), isViaAssignment: true }), true);
  });
});

describe('EnsemblePolicyService.isCountedAssignment / resolveTargetBpm', () => {
  it('UTC-EN-004 ENSEMBLE assignment in state OPEN -> true', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', state: 'OPEN' }), true);
  });
  it('UTC-EN-005 SOLO, ENDED or EXHAUSTED -> false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'SOLO', state: 'OPEN' }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', state: 'ENDED' }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', state: 'EXHAUSTED' }), false);
  });
  it('UTC-EN-006 assignmentBpm 72 -> 72; null -> piece 80', () => {
    assert.equal(EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: 72, pieceBpm: 80 }), 72);
    assert.equal(EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: null, pieceBpm: 80 }), 80);
  });
  it('UTC-EN-025 kind null / undefined -> false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: null, state: 'OPEN' }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: undefined, state: 'OPEN' }), false);
  });
  it('UTC-EN-028 assignmentBpm 0 is kept (nullish coalescing) -> 0', () => {
    assert.equal(EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: 0, pieceBpm: 80 }), 0);
  });
});

describe('EnsemblePolicyService.filterTracks', () => {
  const tracks = [{ instrumentId: 'a' }, { instrumentId: 'b' }, { instrumentId: 'c' }];
  it('UTC-EN-029 student plays b -> all 3 tracks kept in order', () => {
    assert.deepEqual(EnsemblePolicyService.filterTracks({ tracks, studentInstrumentId: 'b' }), tracks);
  });
  it('UTC-EN-030 student instrument not in tracks -> all 3 tracks', () => {
    assert.equal(EnsemblePolicyService.filterTracks({ tracks, studentInstrumentId: 'z' }).length, 3);
  });
  it('UTC-EN-031 empty track list -> []', () => {
    assert.deepEqual(EnsemblePolicyService.filterTracks({ tracks: [], studentInstrumentId: 'a' }), []);
  });
  it('UTC-EN-032 only track is own instrument -> kept', () => {
    assert.deepEqual(EnsemblePolicyService.filterTracks({ tracks: [{ instrumentId: 'a' }], studentInstrumentId: 'a' }), [{ instrumentId: 'a' }]);
  });
});

describe('EnsembleService.resolveContext', () => {
  it('UTC-EN-007 free practice without an open ensemble assignment -> piece context, not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([])] });
    assert.deepEqual(await EnsembleService.resolveContext('SV-1', 'p1'), {
      pieceId: 'p1', pieceTitle: 'Lưu thủy', targetBpm: 80, myInstrumentId: 'i-tranh', myInstrumentName: 'Đàn tranh', assignmentId: null, isAssignmentCounted: false
    });
  });
  it('UTC-EN-045 free practice with an open ensemble assignment -> counted toward it, its bpm', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate()])] });
    const r = await EnsembleService.resolveContext('SV-1', 'p1');
    assert.deepEqual([r.assignmentId, r.isAssignmentCounted, r.targetBpm], ['as-e', true, 72]);
  });
  it('UTC-EN-046 free practice: open SOLO assignment only -> not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate({ currentVersion: { kind: 'SOLO' } })])] });
    const r = await EnsembleService.resolveContext('SV-1', 'p1');
    assert.deepEqual([r.assignmentId, r.isAssignmentCounted], [null, false]);
  });
  it('UTC-EN-047 free practice: ensemble assignment with no attempts left -> not counted', async () => {
    const used = candidate({ maxSubmissions: 1, submissions: [{ status: 'COMPLETED' }] });
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([used])] });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1')).isAssignmentCounted, false);
  });
  it('UTC-EN-008 ensemble assignment: bpm 72, counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate()])] });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', 'as-e');
    assert.deepEqual([r.targetBpm, r.assignmentId, r.isAssignmentCounted], [72, 'as-e', true]);
  });
  it('UTC-EN-009 past deadline -> not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate({ deadline: new Date(Date.now() - DAY) })])] });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).isAssignmentCounted, false);
  });
  it('UTC-EN-048 opened assignment with no attempts left -> opens, not counted (GBR-25)', async () => {
    const used = candidate({ maxSubmissions: 1, submissions: [{ status: 'COMPLETED' }] });
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([used])] });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', 'as-e');
    assert.deepEqual([r.assignmentId, r.isAssignmentCounted], ['as-e', false]);
  });
  it('UTC-EN-049 assignment of an ended class -> opens, not counted, instrument of that class', async () => {
    const ended = enrollment([candidate({ id: 'as-old' })], { classRecord: { id: 'c0', name: 'Lớp cũ', status: 'ENDED', instrumentId: 'i-bau' }, memberInstrumentId: 'i-bau' });
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([]), ended], findInstrumentName: 'Đàn bầu' });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', 'as-old');
    assert.deepEqual([r.isAssignmentCounted, r.myInstrumentId, r.myInstrumentName], [false, 'i-bau', 'Đàn bầu']);
  });
  it('UTC-EN-010 hidden piece, no assignment -> 404', async () => {
    stub({ findPiece: { ...basePiece(), ...piece('HIDDEN') }, findCurrentMembership: member() });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1'), 404, MSG_PIECE);
  });
  it('UTC-EN-011 piece not found -> 404', async () => {
    stub({ findPiece: null });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1'), 404, MSG_PIECE);
  });
  it('UTC-EN-012 student without class -> 403', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: null });
    await rejects404(EnsembleService.resolveContext('SV-9', 'p1'), 403, MSG_MEMBER);
  });
  it('UTC-EN-013 assignment not in any class of the student (other class, other piece, draft) -> 404', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate()])] });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1', 'as-x'), 404, MSG_ASSIGN);
  });
  it('UTC-EN-034 assignment targetBpm null -> falls back to piece bpm 80', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate({ targetBpm: null })])] });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).targetBpm, 80);
  });
  it('UTC-EN-035 assignment currentVersion null -> not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate({ currentVersion: null })])] });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).isAssignmentCounted, false);
  });
  it('UTC-EN-036 SOLO assignment -> context returned but not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([candidate({ currentVersion: { kind: 'SOLO' } })])] });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', 'as-e');
    assert.deepEqual([r.isAssignmentCounted, r.assignmentId], [false, 'as-e']);
  });
  it('UTC-EN-037 lecturer-hidden piece accessible via assignment', async () => {
    stub({ findPiece: { ...basePiece(), ...piece('HIDDEN') }, findCurrentMembership: member(), findEnrollments: [enrollment([candidate()])] });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).pieceId, 'p1');
  });
  it('UTC-EN-038 admin hidden piece via assignment -> 404, membership not queried', async () => {
    stub({ findPiece: { ...basePiece(), ...piece('PUBLIC', 'ADMIN_HIDDEN') }, findCurrentMembership: member() });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1', 'as-e'), 404, MSG_PIECE);
    assert.equal(calls.findCurrentMembership.length, 0);
  });
  it('UTC-EN-039 empty-string assignmentId treated as free practice', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([])] });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', '');
    assert.deepEqual([r.assignmentId, r.isAssignmentCounted], [null, false]);
  });
});

describe('EnsembleService.getTracks', () => {
  const three = () => [track('s-tranh', 'i-tranh', 'Đàn tranh'), track('s-bau', 'i-bau', 'Đàn bầu'), track('s-sao', 'i-sao', 'Sáo')];
  const free = { findPiece: basePiece(), findCurrentMembership: member(), findEnrollments: [enrollment([])] };
  it('UTC-EN-016 returns all tracks incl. own instrument and mySheetMusicId', async () => {
    stub({ ...free, findTracks: three(), findReadyMainSheetId: 's-tranh' });
    const r = await EnsembleService.getTracks('SV-1', 'p1');
    assert.equal(r.mySheetMusicId, 's-tranh');
    assert.deepEqual(r.tracks.map((t) => t.instrumentId), ['i-tranh', 'i-bau', 'i-sao']);
    assert.deepEqual(calls.findReadyMainSheetId[0], ['p1', 'i-tranh']);
  });
  it('UTC-EN-017 no ready main sheet -> mySheetMusicId null', async () => {
    stub({ ...free, findTracks: three(), findReadyMainSheetId: null });
    assert.equal((await EnsembleService.getTracks('SV-1', 'p1')).mySheetMusicId, null);
  });
  it('UTC-EN-018 only track is own instrument -> returned (not 404)', async () => {
    stub({ ...free, findTracks: [track('s-tranh', 'i-tranh', 'Đàn tranh')], findReadyMainSheetId: 's-tranh' });
    assert.equal((await EnsembleService.getTracks('SV-1', 'p1')).tracks.length, 1);
  });
  it('UTC-EN-019 no tracks -> 404', async () => {
    stub({ ...free, findTracks: [] });
    await rejects404(EnsembleService.getTracks('SV-1', 'p1'), 404, MSG_TRACKS);
    assert.equal(calls.findReadyMainSheetId.length, 0);
  });
  it('UTC-EN-040 result shape: DTO mapped, assignmentId of the counted assignment', async () => {
    stub({ ...free, findTracks: [track('s-bau', 'i-bau', 'Đàn bầu')], findReadyMainSheetId: null });
    const r = await EnsembleService.getTracks('SV-1', 'p1');
    assert.deepEqual(r.tracks[0], { id: 's-bau', instrumentId: 'i-bau', instrumentName: 'Đàn bầu', fileUrl: 'url-s-bau', durationSec: 10, offsetMs: 0, defaultVolume: 1 });
    assert.deepEqual([r.assignmentId, r.pieceTitle, r.targetBpm, r.isAssignmentCounted], [null, 'Lưu thủy', 80, false]);
  });
  it('UTC-EN-041 via counted assignment -> bpm 72 and counted', async () => {
    stub({ ...free, findEnrollments: [enrollment([candidate()])], findTracks: three(), findReadyMainSheetId: 's-tranh' });
    const r = await EnsembleService.getTracks('SV-1', 'p1', 'as-e');
    assert.deepEqual([r.targetBpm, r.isAssignmentCounted], [72, true]);
  });
  it('UTC-EN-042 piece not found -> 404, tracks not queried', async () => {
    stub({ findPiece: null });
    await rejects404(EnsembleService.getTracks('SV-1', 'p1'), 404, MSG_PIECE);
    assert.equal(calls.findTracks.length, 0);
  });
  it('UTC-EN-043 student without class -> 403, tracks not queried', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: null });
    await rejects404(EnsembleService.getTracks('SV-9', 'p1'), 403, MSG_MEMBER);
    assert.equal(calls.findTracks.length, 0);
  });
  it('UTC-EN-044 invalid assignment -> 404 assignment message', async () => {
    stub({ ...free });
    await rejects404(EnsembleService.getTracks('SV-1', 'p1', 'as-x'), 404, MSG_ASSIGN);
  });
});
