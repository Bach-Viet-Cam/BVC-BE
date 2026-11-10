import AssignmentConstant from '../constant/AssignmentConstant.ts';

// Decides which (class, assignment) pairs of a bulk assign request are created and which are skipped. Pure: no I/O.
export default class AssignmentAssignPolicyService {
  // Two assignments are "the same" when title (trimmed, case-insensitive), kind and sheet music are equal.
  static groupKey(item: { title: string; kind: Backend.AssignmentKind; sheetMusicId: string | null }): string {
    return [item.title.trim().toLowerCase(), item.kind, item.sheetMusicId ?? ''].join('|');
  }

  static plan(input: {
    sources: Backend.AssignPlanSource[];
    targets: Backend.AssignPlanTarget[];
    currentSemesterName: string | null;
    selectableSheets: Set<string>;
  }): Backend.AssignPlan {
    const toCreate: Backend.AssignPlan['toCreate'] = [];
    const skipped: Backend.AssignPlan['skipped'] = [];

    for (const target of input.targets) {
      // Work on a copy so pairs created earlier in this request count against later ones.
      const existing = [...target.existing];
      for (const source of input.sources) {
        const reason = AssignmentAssignPolicyService.findSkipReason(source, target, existing, input);
        if (reason) {
          skipped.push({ assignmentId: source.id, classId: target.id, reason });
          continue;
        }
        toCreate.push({ sourceId: source.id, classId: target.id });
        existing.push({ title: source.title, kind: source.kind, sheetMusicId: source.sheetMusicId });
      }
    }
    return { toCreate, skipped };
  }

  private static findSkipReason(
    source: Backend.AssignPlanSource,
    target: Backend.AssignPlanTarget,
    existing: Backend.AssignPlanTarget['existing'],
    context: { currentSemesterName: string | null; selectableSheets: Set<string> }
  ): Backend.AssignSkipReason | null {
    if (!target.isLecturer) return 'NOT_CLASS_LECTURER';
    // Both the source and the target class must belong to the current semester.
    if (context.currentSemesterName === null || target.cohort !== context.currentSemesterName || source.cohort !== context.currentSemesterName) return 'NOT_CURRENT_SEMESTER';
    if (target.status !== 'ACTIVE') return 'CLASS_NOT_ACTIVE';
    if (source.sheetMusicId && !context.selectableSheets.has(`${source.sheetMusicId}:${target.instrumentId}`)) return 'SHEET_UNAVAILABLE';
    const key = AssignmentAssignPolicyService.groupKey(source);
    if (existing.some((item) => AssignmentAssignPolicyService.groupKey(item) === key)) return 'ALREADY_ASSIGNED';
    if (AssignmentConstant.singleKinds.includes(source.kind) && existing.some((item) => item.kind === source.kind)) return 'KIND_SLOT_TAKEN';
    return null;
  }
}
