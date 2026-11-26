import AssignmentPolicyService from '../../classes/service/AssignmentPolicyService.ts';

// Decides whether a practice send counts toward a weekly challenge (UC-18).
// The repository already keeps only published, unpaused challenges on this sheet that are running now for an active
// class the student belongs to; this picks the earliest one that still has attempts left. Challenges are solo only.
export default class PracticeChallengeResolver {
  static pickChallengeId(candidates: Practice.ChallengeCandidate[], mode: Practice.PracticeMode): string | null {
    if (mode !== 'SOLO') return null;
    const open = candidates.find((candidate) => AssignmentPolicyService.countUsedSubmissions(candidate.submissions) < candidate.maxSubmissions);
    return open?.id ?? null;
  }
}
