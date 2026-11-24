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

type Stub = Record<string, any>;
const repo = EnsembleRepository as unknown as Stub;
const original: Stub = {};
const names = ['findPiece', 'findTracks', 'findCurrentMembership', 'findPublishedAssignment', 'findReadyMainSheetId'];
let calls: Record<string, any[][]>;

const DAY = 86_400_000;
const basePiece = () => ({ id: 'p1', title: 'Lưu thủy', bpm: 80, ...piece() });
const member = () => ({ classId: 'c1', instrumentId: 'i-tranh', instrument: { name: 'Đàn tranh' } });
const assignment = (over: Stub = {}) => ({
  id: 'as-e', classId: 'c1', status: 'PUBLISHED', targetBpm: 72, deadline: new Date(Date.now() + 7 * DAY),
  sheetMusic: { pieceId: 'p1' }, currentVersion: { kind: 'ENSEMBLE' }, ...over
});
const track = (id: string, instrumentId: string, name: string) => ({ id, instrumentId, fileUrl: `url-${id}`, durationSec: 10, offsetMs: 0, defaultVolume: 1, instrument: { name } });

function stub(impl: Stub) {
  for (const n of names) {
    repo[n] = async (...args: any[]) => {
      calls[n].push(args);
      if (!(n in impl)) throw new Error(`unexpected call ${n}`);
      return typeof impl[n] === 'function' ? impl[n](...args) : impl[n];
    };
  }
}
async function rejects404(p: Promise<unknown>, status: number, message: string) {
  await assert.rejects(p, (e: any) => e instanceof AppError && e.statusCode === status && e.message === message);
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
  const now = 1_000_000;
  it('UTC-EN-004 deadline equals now -> true', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'PUBLISHED', deadline: new Date(now), now }), true);
  });
  it('UTC-EN-005 SOLO / CLOSED / deadline now-1ms -> false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'SOLO', status: 'PUBLISHED', deadline: new Date(now), now }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'CLOSED', deadline: new Date(now), now }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'PUBLISHED', deadline: new Date(now - 1), now }), false);
  });
  it('UTC-EN-006 assignmentBpm 72 -> 72; null -> piece 80', () => {
    assert.equal(EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: 72, pieceBpm: 80 }), 72);
    assert.equal(EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: null, pieceBpm: 80 }), 80);
  });
  it('UTC-EN-024 DRAFT status -> false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'DRAFT', deadline: new Date(now + 1000), now }), false);
  });
  it('UTC-EN-025 kind null / undefined -> false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: null, status: 'PUBLISHED', deadline: new Date(now + 1000), now }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: undefined, status: 'PUBLISHED', deadline: new Date(now + 1000), now }), false);
  });
  it('UTC-EN-026 deadline now+1ms -> true', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'PUBLISHED', deadline: new Date(now + 1), now }), true);
  });
  it('UTC-EN-027 now omitted uses Date.now: future true, past false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'PUBLISHED', deadline: new Date(Date.now() + DAY) }), true);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'PUBLISHED', deadline: new Date(Date.now() - DAY) }), false);
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
  it('UTC-EN-007 free practice returns piece context', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member() });
    assert.deepEqual(await EnsembleService.resolveContext('SV-1', 'p1'), {
      pieceId: 'p1', pieceTitle: 'Lưu thủy', targetBpm: 80, myInstrumentId: 'i-tranh', myInstrumentName: 'Đàn tranh', assignmentId: null, isAssignmentCounted: false
    });
    assert.equal(calls.findPublishedAssignment.length, 0);
  });
  it('UTC-EN-008 ensemble assignment: bpm 72, counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment() });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', 'as-e');
    assert.equal(r.targetBpm, 72);
    assert.equal(r.assignmentId, 'as-e');
    assert.equal(r.isAssignmentCounted, true);
  });
  it('UTC-EN-009 past deadline -> not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment({ deadline: new Date(Date.now() - DAY) }) });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).isAssignmentCounted, false);
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
  it('UTC-EN-013 assignment of another class -> 404', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment({ classId: 'c2' }) });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1', 'as-e'), 404, MSG_ASSIGN);
  });
  it('UTC-EN-014 assignment uses another piece -> 404', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment({ sheetMusic: { pieceId: 'p2' } }) });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1', 'as-e'), 404, MSG_ASSIGN);
  });
  it('UTC-EN-015 published assignment not found -> 404', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: null });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1', 'as-e'), 404, MSG_ASSIGN);
  });
  it('UTC-EN-033 assignment without sheetMusic -> 404', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment({ sheetMusic: null }) });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1', 'as-e'), 404, MSG_ASSIGN);
  });
  it('UTC-EN-034 assignment targetBpm null -> falls back to piece bpm 80', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment({ targetBpm: null }) });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).targetBpm, 80);
  });
  it('UTC-EN-035 assignment currentVersion null -> not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment({ currentVersion: null }) });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).isAssignmentCounted, false);
  });
  it('UTC-EN-036 SOLO assignment -> context returned but not counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment({ currentVersion: { kind: 'SOLO' } }) });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', 'as-e');
    assert.equal(r.isAssignmentCounted, false);
    assert.equal(r.assignmentId, 'as-e');
  });
  it('UTC-EN-037 lecturer-hidden piece accessible via assignment', async () => {
    stub({ findPiece: { ...basePiece(), ...piece('HIDDEN') }, findCurrentMembership: member(), findPublishedAssignment: assignment() });
    assert.equal((await EnsembleService.resolveContext('SV-1', 'p1', 'as-e')).pieceId, 'p1');
  });
  it('UTC-EN-038 admin hidden piece via assignment -> 404, membership not queried', async () => {
    stub({ findPiece: { ...basePiece(), ...piece('PUBLIC', 'ADMIN_HIDDEN') }, findCurrentMembership: member(), findPublishedAssignment: assignment() });
    await rejects404(EnsembleService.resolveContext('SV-1', 'p1', 'as-e'), 404, MSG_PIECE);
    assert.equal(calls.findCurrentMembership.length, 0);
  });
  it('UTC-EN-039 empty-string assignmentId treated as free practice', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member() });
    const r = await EnsembleService.resolveContext('SV-1', 'p1', '');
    assert.equal(r.assignmentId, null);
    assert.equal(r.isAssignmentCounted, false);
  });
});

describe('EnsembleService.getTracks', () => {
  const three = () => [track('s-tranh', 'i-tranh', 'Đàn tranh'), track('s-bau', 'i-bau', 'Đàn bầu'), track('s-sao', 'i-sao', 'Sáo')];
  it('UTC-EN-016 returns all tracks incl. own instrument and mySheetMusicId', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findTracks: three(), findReadyMainSheetId: 's-tranh' });
    const r = await EnsembleService.getTracks('SV-1', 'p1');
    assert.equal(r.mySheetMusicId, 's-tranh');
    assert.deepEqual(r.tracks.map((t) => t.instrumentId), ['i-tranh', 'i-bau', 'i-sao']);
    assert.deepEqual(calls.findReadyMainSheetId[0], ['p1', 'i-tranh']);
  });
  it('UTC-EN-017 no ready main sheet -> mySheetMusicId null', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findTracks: three(), findReadyMainSheetId: null });
    assert.equal((await EnsembleService.getTracks('SV-1', 'p1')).mySheetMusicId, null);
  });
  it('UTC-EN-018 only track is own instrument -> returned (not 404)', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findTracks: [track('s-tranh', 'i-tranh', 'Đàn tranh')], findReadyMainSheetId: 's-tranh' });
    assert.equal((await EnsembleService.getTracks('SV-1', 'p1')).tracks.length, 1);
  });
  it('UTC-EN-019 no tracks -> 404', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findTracks: [] });
    await rejects404(EnsembleService.getTracks('SV-1', 'p1'), 404, MSG_TRACKS);
    assert.equal(calls.findReadyMainSheetId.length, 0);
  });
  it('UTC-EN-040 result shape: DTO mapped, assignmentId omitted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findTracks: [track('s-bau', 'i-bau', 'Đàn bầu')], findReadyMainSheetId: null });
    const r: any = await EnsembleService.getTracks('SV-1', 'p1');
    assert.deepEqual(r.tracks[0], { id: 's-bau', instrumentId: 'i-bau', instrumentName: 'Đàn bầu', fileUrl: 'url-s-bau', durationSec: 10, offsetMs: 0, defaultVolume: 1 });
    assert.equal('assignmentId' in r, false);
    assert.equal(r.pieceTitle, 'Lưu thủy');
    assert.equal(r.targetBpm, 80);
    assert.equal(r.isAssignmentCounted, false);
  });
  it('UTC-EN-041 via counted assignment -> bpm 72 and counted', async () => {
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: assignment(), findTracks: three(), findReadyMainSheetId: 's-tranh' });
    const r = await EnsembleService.getTracks('SV-1', 'p1', 'as-e');
    assert.equal(r.targetBpm, 72);
    assert.equal(r.isAssignmentCounted, true);
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
    stub({ findPiece: basePiece(), findCurrentMembership: member(), findPublishedAssignment: null });
    await rejects404(EnsembleService.getTracks('SV-1', 'p1', 'as-x'), 404, MSG_ASSIGN);
  });
});
