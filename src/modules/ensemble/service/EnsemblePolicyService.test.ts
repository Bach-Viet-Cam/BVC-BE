import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import EnsemblePolicyService from './EnsemblePolicyService.ts';

describe('EnsemblePolicyService.filterTracks (GBR-07)', () => {
  const tracks = [{ instrumentId: 'a' }, { instrumentId: 'b' }, { instrumentId: 'c' }];
  it('giữ bè của sinh viên để nghe mẫu', () => {
    assert.deepEqual(EnsemblePolicyService.filterTracks({ tracks, studentInstrumentId: 'b' }), tracks);
  });
  it('giữ nguyên khi không có bè trùng', () => {
    assert.equal(EnsemblePolicyService.filterTracks({ tracks, studentInstrumentId: 'z' }).length, 3);
  });
  it('giữ bè mẫu khi bài chỉ có nhạc cụ của sinh viên', () => {
    assert.deepEqual(EnsemblePolicyService.filterTracks({ tracks: [{ instrumentId: 'a' }], studentInstrumentId: 'a' }), [{ instrumentId: 'a' }]);
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

describe('EnsemblePolicyService.isCountedAssignment (GBR-25)', () => {
  it('bài tập hòa tấu đang mở → true', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', state: 'OPEN' }), true);
  });
  it('bài tập SOLO → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'SOLO', state: 'OPEN' }), false);
  });
  it('đã đóng, quá hạn hoặc lớp kết thúc → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', state: 'ENDED' }), false);
  });
  it('hết lượt nộp → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: 'ENSEMBLE', state: 'EXHAUSTED' }), false);
  });
  it('kind null hoặc undefined → false', () => {
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: null, state: 'OPEN' }), false);
    assert.equal(EnsemblePolicyService.isCountedAssignment({ kind: undefined, state: 'OPEN' }), false);
  });
});
