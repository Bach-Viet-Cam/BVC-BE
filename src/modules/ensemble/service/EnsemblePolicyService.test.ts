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

describe('EnsemblePolicyService.validateUpload (GBR-10)', () => {
  const formats = ['mp3', 'wav', 'm4a'];
  it('từ chối file vượt dung lượng tối đa', () => {
    assert.equal(EnsemblePolicyService.validateUpload({ sizeBytes: 30 * 1024 * 1024, extension: 'mp3', maxMb: 20, formats }).isValid, false);
  });
  it('từ chối định dạng không được phép', () => {
    assert.equal(EnsemblePolicyService.validateUpload({ sizeBytes: 1024, extension: 'ogg', maxMb: 20, formats }).isValid, false);
  });
  it('chấp nhận file hợp lệ, không phân biệt hoa thường và dấu chấm', () => {
    assert.equal(EnsemblePolicyService.validateUpload({ sizeBytes: 5 * 1024 * 1024, extension: '.M4A', maxMb: 20, formats }).isValid, true);
  });
  it('từ chối file rỗng', () => {
    assert.equal(EnsemblePolicyService.validateUpload({ sizeBytes: 0, extension: 'mp3', maxMb: 20, formats }).isValid, false);
  });
});

describe('EnsemblePolicyService.parseTrackSettings', () => {
  it('chấp nhận cấu hình hợp lệ', () => {
    const raw = JSON.stringify([{ trackId: 't1', volume: 70, isMuted: false, isSolo: true }]);
    assert.equal(EnsemblePolicyService.parseTrackSettings(raw)?.length, 1);
  });
  it('từ chối volume ngoài 0-100 hoặc JSON hỏng', () => {
    assert.equal(EnsemblePolicyService.parseTrackSettings(JSON.stringify([{ trackId: 't1', volume: 120, isMuted: false, isSolo: false }])), null);
    assert.equal(EnsemblePolicyService.parseTrackSettings('not json'), null);
  });
});
