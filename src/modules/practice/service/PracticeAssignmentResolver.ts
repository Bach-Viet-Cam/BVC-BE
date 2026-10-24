import AssignmentPolicyService from '../../classes/service/AssignmentPolicyService.ts';

// Decides whether a practice send counts toward a class assignment.
// It counts only for the MAIN sheet of the class instrument, while the class is active, the assignment is
// published and before its deadline (the class end date) with attempts left. Anything else is free practice.
// Bài nộp hòa tấu chỉ ghép bài tập loại Hòa tấu và ngược lại.
export default class PracticeAssignmentResolver {
  static matchesMode(candidate: Practice.AssignmentCandidate, mode: Practice.PracticeMode): boolean {
    const isEnsemble = candidate.currentVersion?.kind === 'ENSEMBLE';
    return mode === 'ENSEMBLE' ? isEnsemble : !isEnsemble;
  }

  static isAssignedSheet(sheet: Pick<Practice.SheetTemplate, 'kind' | 'instrumentId'>, classInstrumentId: string): boolean {
    return sheet.kind === 'MAIN' && sheet.instrumentId === classInstrumentId;
  }

  static stateOf(candidate: Practice.AssignmentCandidate, classStatus: Backend.ClassStatus, now: Date): { state: Practice.AssignmentState; usedSubmissions: number } {
    const usedSubmissions = AssignmentPolicyService.countUsedSubmissions(candidate.submissions);
    const isOpen = classStatus === 'ACTIVE' && candidate.status === 'PUBLISHED' && candidate.deadline.getTime() >= now.getTime();
    if (!isOpen) return { state: 'ENDED', usedSubmissions };
    return { state: usedSubmissions >= candidate.maxSubmissions ? 'EXHAUSTED' : 'OPEN', usedSubmissions };
  }

  // Prefers the hinted assignment, then an open one with the nearest deadline, then the latest one
  static resolve(
    sheet: Pick<Practice.SheetTemplate, 'kind' | 'instrumentId'>,
    enrollment: Practice.ClassAssignments | null,
    now: Date,
    hintAssignmentId?: string,
    mode: Practice.PracticeMode = 'SOLO'
  ): Practice.ResolvedAssignment | null {
    if (!enrollment) return null;
    const requiredInstrumentId = mode === 'ENSEMBLE' ? enrollment.memberInstrumentId : enrollment.classRecord.instrumentId;
    if (!PracticeAssignmentResolver.isAssignedSheet(sheet, requiredInstrumentId)) return null;
    const filtered = enrollment.assignments.filter((candidate) => PracticeAssignmentResolver.matchesMode(candidate, mode));
    const resolved = filtered.map((candidate) => ({
      candidate,
      ...PracticeAssignmentResolver.stateOf(candidate, enrollment.classRecord.status, now)
    }));
    const hinted = resolved.find((item) => item.candidate.id === hintAssignmentId);
    if (hinted) return hinted;
    const byDeadline = [...resolved].sort((first, second) => first.candidate.deadline.getTime() - second.candidate.deadline.getTime());
    return byDeadline.find((item) => item.state === 'OPEN') ?? byDeadline.at(-1) ?? null;
  }
}

