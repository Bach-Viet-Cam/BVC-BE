import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import StudentStatsPolicyService from './StudentStatsPolicyService.ts';

function cls(id: string, status: Backend.ClassStatus, startDate: string): { id: string; status: Backend.ClassStatus; startDate: Date } {
  return { id, status, startDate: new Date(startDate) };
}

describe('StudentStatsPolicyService.canEvaluate', () => {
  it('allows only an active class with an active member', () => {
    assert.equal(StudentStatsPolicyService.canEvaluate('ACTIVE', true), true);
    assert.equal(StudentStatsPolicyService.canEvaluate('ACTIVE', false), false);
    assert.equal(StudentStatsPolicyService.canEvaluate('ENDED', true), false);
  });
});

describe('StudentStatsPolicyService.pickDefaultClass', () => {
  it('picks the newest active class', () => {
    const picked = StudentStatsPolicyService.pickDefaultClass([
      cls('ended', 'ENDED', '2026-09-01'),
      cls('old', 'ACTIVE', '2026-02-01'),
      cls('new', 'ACTIVE', '2026-08-01')
    ]);
    assert.equal(picked, 'new');
  });

  it('falls back to the newest class when none is active', () => {
    assert.equal(StudentStatsPolicyService.pickDefaultClass([cls('a', 'ENDED', '2026-01-01'), cls('b', 'ENDED', '2026-05-01')]), 'b');
  });

  it('returns null without classes', () => {
    assert.equal(StudentStatsPolicyService.pickDefaultClass([]), null);
  });
});
