import { describe, expect, it } from 'vitest';
import AssignmentProgressCalculator from '../../src/modules/assignments/service/AssignmentProgressCalculator.ts';

const at = (iso: string) => new Date(iso);

describe('AssignmentProgressCalculator', () => {
  it('no submission → NOT_SUBMITTED', () => {
    expect(AssignmentProgressCalculator.summarize([], 70)).toEqual({ status: 'NOT_SUBMITTED', submissionCount: 0, lastSubmittedAt: null, bestAccuracy: null });
  });

  it('only rejected and failed submissions are not counted', () => {
    const result = AssignmentProgressCalculator.summarize([
      { status: 'REJECTED', accuracy: null, submittedAt: at('2026-10-10T01:00:00Z') },
      { status: 'FAILED', accuracy: null, submittedAt: at('2026-10-11T01:00:00Z') }
    ], 70);
    expect(result).toEqual({ status: 'NOT_SUBMITTED', submissionCount: 0, lastSubmittedAt: null, bestAccuracy: null });
    expect(AssignmentProgressCalculator.isCounted('REJECTED')).toBe(false);
    expect(AssignmentProgressCalculator.isCounted('PROCESSING')).toBe(true);
  });

  it('a processing submission counts as SUBMITTED without accuracy', () => {
    expect(AssignmentProgressCalculator.summarize([{ status: 'PROCESSING', accuracy: null, submittedAt: at('2026-10-10T01:00:00Z') }], 70))
      .toMatchObject({ status: 'SUBMITTED', submissionCount: 1, bestAccuracy: null });
  });

  it('just under the threshold is SUBMITTED, exactly at the threshold is PASSED', () => {
    expect(AssignmentProgressCalculator.summarize([{ status: 'COMPLETED', accuracy: 69.99, submittedAt: at('2026-10-10T01:00:00Z') }], 70).status).toBe('SUBMITTED');
    expect(AssignmentProgressCalculator.summarize([{ status: 'COMPLETED', accuracy: 70, submittedAt: at('2026-10-10T01:00:00Z') }], 70).status).toBe('PASSED');
  });

  it('counts, latest time and best accuracy over counted submissions', () => {
    const result = AssignmentProgressCalculator.summarize([
      { status: 'COMPLETED', accuracy: 55, submittedAt: at('2026-10-10T01:00:00Z') },
      { status: 'COMPLETED', accuracy: 82, submittedAt: at('2026-10-11T01:00:00Z') },
      { status: 'PROCESSING', accuracy: null, submittedAt: at('2026-10-13T01:00:00Z') },
      { status: 'REJECTED', accuracy: 99, submittedAt: at('2026-10-14T01:00:00Z') }
    ], 70);
    expect(result).toEqual({ status: 'PASSED', submissionCount: 3, lastSubmittedAt: at('2026-10-13T01:00:00Z'), bestAccuracy: 82 });
  });
});
