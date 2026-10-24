import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import EnsemblePolicyService from './EnsemblePolicyService.ts';

describe('EnsemblePolicyService.filterTracks (GBR-07)', () => {
  const tracks = [{ instrumentId: 'a' }, { instrumentId: 'b' }, { instrumentId: 'c' }];
  it('bỏ bè trùng nhạc cụ của sinh viên', () => {
    assert.deepEqual(EnsemblePolicyService.filterTracks({ tracks, studentInstrumentId: 'b' }), [{ instrumentId: 'a' }, { instrumentId: 'c' }]);
  });
  it('giữ nguyên khi không có bè trùng', () => {
    assert.equal(EnsemblePolicyService.filterTracks({ tracks, studentInstrumentId: 'z' }).length, 3);
  });
  it('trả rỗng khi bài chỉ có bè của chính sinh viên', () => {
    assert.deepEqual(EnsemblePolicyService.filterTracks({ tracks: [{ instrumentId: 'a' }], studentInstrumentId: 'a' }), []);
  });
});

describe('EnsemblePolicyService.resolveTargetBpm (GBR-19)', () => {
  it('ưu tiên BPM của bài tập', () => {
    assert.equal(EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: 84, pieceBpm: 96 }), 84);
  });
  it('dùng BPM của bài nhạc khi bài tập không đặt', () => {
    assert.equal(EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: null, pieceBpm: 96 }), 96);
  });
});

describe('EnsemblePolicyService.canPracticePiece', () => {
  const piece = (visibility: 'PUBLIC' | 'HIDDEN', moderation: 'NORMAL' | 'ADMIN_HIDDEN' = 'NORMAL', deletedAt: Date | null = null) => ({ visibility, moderation, deletedAt });
  it('luyện tự do chỉ với bài công khai', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('PUBLIC'), isViaAssignment: false }), true);
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('HIDDEN'), isViaAssignment: false }), false);
  });
  it('bài tập được dùng bài giảng viên đang ẩn', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('HIDDEN'), isViaAssignment: true }), true);
  });
  it('không bao giờ dùng bài bị admin ẩn hoặc đã xóa', () => {
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('PUBLIC', 'ADMIN_HIDDEN'), isViaAssignment: true }), false);
    assert.equal(EnsemblePolicyService.canPracticePiece({ piece: piece('PUBLIC', 'NORMAL', new Date()), isViaAssignment: true }), false);
  });
});

describe('EnsemblePolicyService.isCountedAssignment', () => {
  const now = 1_000_000;
  const future = new Date(now + 60_000);
  const past = new Date(now - 60_000);

  it('ENSEMBLE + PUBLISHED + còn hạn → true', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'PUBLISHED', deadline: future, now }), true);
  });

  it('SOLO → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'SOLO', status: 'PUBLISHED', deadline: future, now }), false);
  });

  it('CLOSED → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'CLOSED', deadline: future, now }), false);
  });

  it('quá hạn → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', status: 'PUBLISHED', deadline: past, now }), false);
  });

  it('kind null hoặc undefined → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: null, status: 'PUBLISHED', deadline: future, now }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: undefined, status: 'PUBLISHED', deadline: future, now }), false);
  });
});
