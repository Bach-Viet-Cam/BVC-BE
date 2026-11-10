import AssignmentConstant from '../../assignments/constant/AssignmentConstant.ts';
import ClassConstant from '../constant/ClassConstant.ts';

// Validates the assignment list sent when copying a class. Pure: no I/O.
export default class ClassCopyPolicyService {
  // selectableSheetIds: sheet music ids already confirmed usable for the new class's instrument.
  static findAssignmentErrors(assignments: Backend.CopyAssignmentInput[], selectableSheetIds: ReadonlySet<string>): Backend.FieldError[] {
    const errors: Backend.FieldError[] = [];
    const kindCounts = new Map<Backend.AssignmentKind, number>();
    for (const item of assignments) kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);

    assignments.forEach((item, index) => {
      if (AssignmentConstant.singleKinds.includes(item.kind) && (kindCounts.get(item.kind) ?? 0) > 1) {
        errors.push({
          field: `assignments.${index}.kind`,
          code: 'MSG-08',
          message: ClassConstant.messages.COPY_KIND_DUPLICATED(AssignmentConstant.kindLabels[item.kind])
        });
      }
      if (item.sheetMusicId && !selectableSheetIds.has(item.sheetMusicId)) {
        errors.push({ field: `assignments.${index}.sheetMusicId`, code: 'MSG-48', message: AssignmentConstant.messages.SHEET_MUSIC_UNAVAILABLE });
      }
    });
    return errors;
  }
}
