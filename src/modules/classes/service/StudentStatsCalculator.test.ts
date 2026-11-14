import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import StudentStatsCalculator from './StudentStatsCalculator.ts';

function assignment(id: string, kind: Backend.AssignmentKind, publishedAt: Date | null = null): Backend.StatsAssignmentRow {
  return { id, title: `Bài ${id}`, kind, publishedAt };
}

function submission(id: string, assignmentId: string, createdAt: string, accuracy: number | null, status: Backend.SubmissionStatus = 'COMPLETED'): Backend.StatsSubmissionRow {
  return { id, assignmentId, status, accuracy, createdAt: new Date(createdAt), hasComment: false };
}

describe('StudentStatsCalculator.build', () => {
  it('build orders assignments by kind then publishedAt', () => {
    const result = StudentStatsCalculator.build([
      assignment('a3', 'OTHER'),
      assignment('a2', 'SOLO', new Date('2026-10-02')),
      assignment('a1', 'SOLO', new Date('2026-10-01')),
      assignment('a4', 'ENSEMBLE')
    ], []);
    assert.deepEqual(result.map((item) => item.id), ['a1', 'a2', 'a4', 'a3']);
  });

  it('build numbers attempts per assignment in submission order', () => {
    const result = StudentStatsCalculator.build([assignment('a1', 'SOLO')], [
      submission('s3', 'a1', '2026-11-03T00:00:00Z', 80),
      submission('s1', 'a1', '2026-11-01T00:00:00Z', 60),
      submission('s2', 'a1', '2026-11-02T00:00:00Z', 70)
    ]);
    const attempts = result[0].attempts;
    assert.deepEqual(attempts.map((attempt) => attempt.attemptNo), [1, 2, 3]);
    assert.deepEqual(attempts.map((attempt) => attempt.submissionId), ['s1', 's2', 's3']);
    assert.equal(attempts[0].submittedAt, '2026-11-01T00:00:00.000Z');
  });

  it('build ignores null accuracy for best', () => {
    const result = StudentStatsCalculator.build([assignment('a1', 'SOLO')], [
      submission('s1', 'a1', '2026-11-01T00:00:00Z', 70),
      submission('s2', 'a1', '2026-11-02T00:00:00Z', null, 'FAILED'),
      submission('s3', 'a1', '2026-11-03T00:00:00Z', 85)
    ]);
    assert.equal(result[0].bestAccuracy, 85);
    assert.equal(result[0].attemptCount, 3);
    assert.equal(result[0].attempts[1].accuracy, null);
  });

  it('build keeps assignments without submissions', () => {
    const result = StudentStatsCalculator.build([assignment('a2', 'SOLO')], []);
    assert.deepEqual(result[0], { id: 'a2', title: 'Bài a2', kind: 'SOLO', bestAccuracy: null, attemptCount: 0, attempts: [] });
  });

  it('build drops submissions of unknown assignments', () => {
    const result = StudentStatsCalculator.build([assignment('a1', 'SOLO')], [submission('s1', 'x', '2026-11-01T00:00:00Z', 50)]);
    assert.equal(result[0].attemptCount, 0);
  });
});
