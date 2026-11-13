import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AssignmentDTO from './AssignmentDTO.ts';

const sheet = {
  id: 'sheet-1',
  name: 'Bản gốc',
  visibility: 'PUBLIC' as const,
  moderation: 'NORMAL' as const,
  piece: { id: 'piece-1', title: 'Lý ngựa ô', bpm: 90, visibility: 'PUBLIC' as const, moderation: 'NORMAL' as const, deletedAt: null }
};

function buildRecord(sheetMusic: typeof sheet | null): Backend.AssignmentRecord {
  return {
    id: 'a1',
    classId: 'c1',
    minAccuracy: null,
    createdBy: null,
    status: 'PUBLISHED',
    deletedAt: null,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    closedAt: null,
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    class: { id: 'c1', name: 'TRD301', cohort: 'HK1', status: 'ACTIVE', instrumentId: 'i1', ownerId: 'u1', coLecturers: [] },
    currentVersion: { id: 'v1', version: 2, title: 'Độc tấu', description: null, kind: 'SOLO', requiredBpm: null, sheetMusic }
  };
}

describe('AssignmentDTO.toOverviewAssignment', () => {
  const counts = { practiceCount: 5, submittedCount: 3, memberCount: 20 };

  it('mang theo sheet nhạc và các số đếm', () => {
    const dto = AssignmentDTO.toOverviewAssignment(buildRecord(sheet), counts);
    assert.equal(dto.sheetMusicId, 'sheet-1');
    assert.equal(dto.sheetTitle, 'Lý ngựa ô');
    assert.equal(dto.practiceCount, 5);
    assert.equal(dto.submittedCount, 3);
    assert.equal(dto.memberCount, 20);
    assert.equal(dto.title, 'Độc tấu');
    assert.equal(dto.kind, 'SOLO');
    assert.equal(dto.version, 2);
  });

  it('bài không gắn sheet nhạc có sheetMusicId và sheetTitle là null', () => {
    const dto = AssignmentDTO.toOverviewAssignment(buildRecord(null), counts);
    assert.equal(dto.sheetMusicId, null);
    assert.equal(dto.sheetTitle, null);
  });
});
