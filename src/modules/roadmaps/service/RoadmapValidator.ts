import RoadmapConstant from '../constant/RoadmapConstant.ts';

const limits = RoadmapConstant.limits;
const messages = RoadmapConstant.messages;

// Pure validation of a roadmap version before it is saved (spec §4.1). Collects every error so the
// admin screen can show them under the right week at once.
export default class RoadmapValidator {
  static normalizeWeeks(weeks: Backend.RoadmapWeekInput[]): Backend.RoadmapWeekInput[] {
    return weeks
      .map((week) => ({ ...week, title: week.title.trim(), content: week.content.trim() }))
      .sort((first, second) => first.weekNumber - second.weekNumber);
  }

  static validateWeeks(
    weeks: Backend.RoadmapWeekInput[],
    piecesById: Map<string, Backend.PieceSnapshot>,
    instrumentId: string
  ): Backend.FieldError[] {
    if (!RoadmapValidator.hasAllWeeks(weeks)) return [{ field: 'weeks', message: messages.WRONG_WEEK_COUNT }];
    return weeks.flatMap((week) => [
      ...RoadmapValidator.validateText(week),
      ...RoadmapValidator.validateExercises(week, piecesById, instrumentId)
    ]);
  }

  static hasAllWeeks(weeks: Backend.RoadmapWeekInput[]): boolean {
    const weekNumbers = new Set(weeks.map((week) => week.weekNumber));
    if (weeks.length !== limits.WEEK_COUNT || weekNumbers.size !== limits.WEEK_COUNT) return false;
    return [...weekNumbers].every((weekNumber) => Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= limits.WEEK_COUNT);
  }

  static validateText(week: Backend.RoadmapWeekInput): Backend.FieldError[] {
    const errors: Backend.FieldError[] = [];
    const prefix = `weeks.${week.weekNumber}`;
    if (!week.title.trim()) errors.push({ field: `${prefix}.title`, code: 'MSG-35', message: messages.weekTitleRequired(week.weekNumber) });
    else if (week.title.length > limits.TITLE_MAX) {
      errors.push({ field: `${prefix}.title`, code: 'MSG-37', message: messages.weekTitleTooLong(week.weekNumber) });
    }
    if (!week.content.trim()) errors.push({ field: `${prefix}.content`, code: 'MSG-35', message: messages.weekContentRequired(week.weekNumber) });
    else if (week.content.length > limits.CONTENT_MAX) {
      errors.push({ field: `${prefix}.content`, code: 'MSG-37', message: messages.weekContentTooLong(week.weekNumber) });
    }
    return errors;
  }

  // One error per week, by priority: too many → duplicate → unavailable (MSG-48).
  static validateExercises(
    week: Backend.RoadmapWeekInput,
    piecesById: Map<string, Backend.PieceSnapshot>,
    instrumentId: string
  ): Backend.FieldError[] {
    const field = `weeks.${week.weekNumber}.exerciseIds`;
    if (week.exerciseIds.length > limits.EXERCISES_PER_WEEK_MAX) return [{ field, message: messages.TOO_MANY_EXERCISES }];
    if (new Set(week.exerciseIds).size !== week.exerciseIds.length) return [{ field, message: messages.DUPLICATE_EXERCISE }];
    const hasUnavailable = week.exerciseIds.some((pieceId) => !RoadmapValidator.isSelectable(piecesById.get(pieceId), instrumentId));
    return hasUnavailable ? [{ field, code: 'MSG-48', message: messages.EXERCISE_UNAVAILABLE }] : [];
  }

  static isSelectable(piece: Backend.PieceSnapshot | undefined, instrumentId: string): boolean {
    return Boolean(piece && piece.kind === 'FINGER_EXERCISE' && piece.instrumentId === instrumentId && piece.isVisible);
  }
}
