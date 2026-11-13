import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AssignmentPracticeStatsCalculator from './AssignmentPracticeStatsCalculator.ts';

const NOW = new Date('2026-11-12T10:00:00Z');

function practice(assignmentId: string, studentId: string, createdAt: Date = NOW): Backend.CountedPractice {
  return { assignmentId, studentId, createdAt };
}

function input(overrides: Partial<Backend.PracticeStatsInput> = {}): Backend.PracticeStatsInput {
  return {
    practices: [],
    assignmentClassIds: new Map(),
    membersByClass: new Map(),
    now: NOW,
    ...overrides
  };
}

describe('AssignmentPracticeStatsCalculator.summarize', () => {
  it('summarize counts every practice but only members as practiced students', () => {
    const result = AssignmentPracticeStatsCalculator.summarize(input({
      practices: [practice('a1', 's1'), practice('a1', 's1'), practice('a1', 's3')],
      assignmentClassIds: new Map([['a1', 'c1']]),
      membersByClass: new Map([['c1', new Set(['s1', 's2'])]])
    }));
    assert.equal(result.totalPractices, 3);
    assert.equal(result.practicedStudents, 1);
    assert.equal(result.memberCount, 2);
    assert.equal(result.averagePerStudent, 3);
  });

  it('counts a student once per class across several copies', () => {
    const base = {
      assignmentClassIds: new Map([['a1', 'c1'], ['a2', 'c1'], ['a3', 'c2']]),
      membersByClass: new Map([['c1', new Set(['s1', 's2'])], ['c2', new Set(['s1'])]])
    };
    const one = AssignmentPracticeStatsCalculator.summarize(input({ ...base, practices: [practice('a1', 's1'), practice('a2', 's1')] }));
    assert.equal(one.practicedStudents, 1);
    const two = AssignmentPracticeStatsCalculator.summarize(input({ ...base, practices: [practice('a1', 's1'), practice('a2', 's1'), practice('a3', 's1')] }));
    assert.equal(two.practicedStudents, 2);
    assert.equal(two.memberCount, 3);
  });

  it('ignores practices of out-of-scope assignments', () => {
    const result = AssignmentPracticeStatsCalculator.summarize(input({
      practices: [practice('aX', 's1')],
      assignmentClassIds: new Map([['a1', 'c1']]),
      membersByClass: new Map([['c1', new Set(['s1'])]])
    }));
    assert.equal(result.totalPractices, 0);
    assert.equal(result.practicedStudents, 0);
  });

  it('average is rounded to one decimal and 0 with no practice', () => {
    const students = ['s1', 's2', 's3'];
    const practices = [...students.map((id) => practice('a1', id)), practice('a1', 's1'), practice('a1', 's1'), practice('a1', 's2'), practice('a1', 's2')];
    const result = AssignmentPracticeStatsCalculator.summarize(input({
      practices,
      assignmentClassIds: new Map([['a1', 'c1']]),
      membersByClass: new Map([['c1', new Set(students)]])
    }));
    assert.equal(result.totalPractices, 7);
    assert.equal(result.averagePerStudent, 2.3);
    assert.equal(AssignmentPracticeStatsCalculator.summarize(input()).averagePerStudent, 0);
  });

  it('last7Days has 7 zero-filled days ending today in UTC+7', () => {
    const result = AssignmentPracticeStatsCalculator.summarize(input({
      practices: [practice('a1', 's1', new Date('2026-11-11T17:30:00Z'))],
      assignmentClassIds: new Map([['a1', 'c1']]),
      membersByClass: new Map([['c1', new Set(['s1'])]])
    }));
    assert.equal(result.last7Days.length, 7);
    assert.equal(result.last7Days[0].date, '2026-11-06');
    assert.deepEqual(result.last7Days[6], { date: '2026-11-12', count: 1 });
  });
});

describe('AssignmentPracticeStatsCalculator.byClass', () => {
  it('byClass returns one row per class', () => {
    const rows = AssignmentPracticeStatsCalculator.byClass(input({
      practices: [practice('a1', 's1'), practice('a2', 's9')],
      assignmentClassIds: new Map([['a1', 'c1'], ['a2', 'c2']]),
      membersByClass: new Map([['c1', new Set(['s1', 's2'])], ['c2', new Set(['s8'])]])
    }), new Map([['c1', 'TRD301'], ['c2', 'TRD302']]));
    assert.deepEqual(rows, [
      { classId: 'c1', className: 'TRD301', practicedStudents: 1, memberCount: 2 },
      { classId: 'c2', className: 'TRD302', practicedStudents: 0, memberCount: 1 }
    ]);
  });
});
