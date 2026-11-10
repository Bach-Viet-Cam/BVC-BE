import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ClassDTO from './ClassDTO.ts';

const lecturer = (id: string) => ({ id, username: `GV ${id}`, email: `${id}@bvc.test` });

function buildClass(overrides: Partial<Backend.ClassRecord> = {}): Backend.ClassRecord {
  return {
    id: 'c1',
    name: 'TRD301',
    cohort: 'K20',
    description: 'Mô tả',
    instrumentId: 'i1',
    ownerId: 'u1',
    startDate: new Date('2026-09-01T00:00:00Z'),
    endDate: new Date('2026-12-31T00:00:00Z'),
    status: 'ACTIVE',
    endedAt: null,
    roadmapId: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    instrument: { id: 'i1', name: 'Đàn tranh' },
    owner: lecturer('u1'),
    coLecturers: [
      { lecturerId: 'u2', lecturer: lecturer('u2') },
      { lecturerId: 'u3', lecturer: lecturer('u3') }
    ],
    _count: { members: 4 },
    ...overrides
  };
}

function buildAssignment(id: string, kind: Backend.AssignmentKind, status: Backend.AssignmentStatus = 'PUBLISHED'): Backend.AssignmentRecord {
  return {
    id,
    classId: 'c1',
    status,
    deletedAt: null,
    publishedAt: null,
    closedAt: null,
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    class: { id: 'c1', name: 'TRD301', cohort: 'K20', status: 'ACTIVE', instrumentId: 'i1', ownerId: 'u1', coLecturers: [] },
    currentVersion: { id: `v-${id}`, version: 1, title: `Bài ${id}`, description: null, kind, requiredBpm: 80, sheetMusic: null }
  };
}

describe('ClassDTO.toCopySourceDTO', () => {
  it('chủ lớp xem: coLecturers là các giảng viên cùng dạy', () => {
    const dto = ClassDTO.toCopySourceDTO(buildClass(), [], 'u1');
    assert.deepEqual(dto.coLecturers.map((item) => item.id), ['u2', 'u3']);
    assert.deepEqual(dto.coLecturers[0], { id: 'u2', fullName: 'GV u2', email: 'u2@bvc.test' });
  });

  it('giảng viên cùng dạy xem: coLecturers gồm chủ lớp và người còn lại', () => {
    const dto = ClassDTO.toCopySourceDTO(buildClass(), [], 'u2');
    assert.deepEqual(dto.coLecturers.map((item) => item.id), ['u1', 'u3']);
  });

  it('sắp bài SOLO, ENSEMBLE rồi các bài còn lại theo createdAt', () => {
    const assignments = [buildAssignment('a1', 'OTHER'), buildAssignment('a2', 'ENSEMBLE'), buildAssignment('a3', 'SOLO'), buildAssignment('a4', 'BONUS')];
    const dto = ClassDTO.toCopySourceDTO(buildClass(), assignments, 'u1');
    assert.deepEqual(dto.assignments.map((item) => item.kind), ['SOLO', 'ENSEMBLE', 'OTHER', 'BONUS']);
  });

  it('giữ trạng thái CLOSED và nội dung từ version hiện tại', () => {
    const dto = ClassDTO.toCopySourceDTO(buildClass(), [buildAssignment('a1', 'SOLO', 'CLOSED')], 'u1');
    assert.equal(dto.assignments[0]?.status, 'CLOSED');
    assert.equal(dto.assignments[0]?.title, 'Bài a1');
    assert.equal(dto.assignments[0]?.requiredBpm, 80);
    assert.equal(dto.assignments[0]?.sheetMusic, null);
    assert.deepEqual(dto.instrument, { id: 'i1', name: 'Đàn tranh' });
  });
});
