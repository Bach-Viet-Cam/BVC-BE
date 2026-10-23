import AppError from '../../../utils/AppError.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import PracticeAssignmentResolver from './PracticeAssignmentResolver.ts';

const { messages } = PracticeConstant;

// Data behind the record screen's info box: the sheet and, when it counts, the student's class assignment
export default class PracticeContextService {
  constructor(
    private readonly repository: PracticeSubmissionRepository = new PracticeSubmissionRepository(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async get(studentId: string, query: { sheetMusicId: string; assignmentId?: string }): Promise<Practice.ContextDTO> {
    const sheet = await this.repository.findContextSheet(query.sheetMusicId);
    if (!sheet) throw AppError.notFound(messages.SHEET_NOT_FOUND);
    const enrollment = await this.repository.findClassAssignments(studentId, sheet.piece.id);
    const resolved = PracticeAssignmentResolver.resolve(sheet, enrollment, this.now(), query.assignmentId);
    return {
      piece: { id: sheet.piece.id, title: sheet.piece.title },
      sheet: {
        id: sheet.id,
        name: sheet.name,
        isMain: sheet.kind === 'MAIN',
        durationSec: sheet.durationSec,
        instrument: { id: sheet.instrument.id, name: sheet.instrument.name },
        level: sheet.level,
        practice: PracticeContextService.buildPracticeState(sheet)
      },
      enrollment: enrollment ? 'IN_CLASS' : 'NO_CLASS',
      classRecord: enrollment ? { id: enrollment.classRecord.id, name: enrollment.classRecord.name } : null,
      assignment: resolved ? PracticeContextService.toAssignment(resolved, sheet.piece.bpm) : null
    };
  }

  private static buildPracticeState(sheet: Practice.ContextSheet): Practice.ContextDTO['sheet']['practice'] {
    if (sheet.kind !== 'MAIN') return { isAvailable: false, reason: messages.NOT_PRACTICABLE_HINT };
    if (!sheet.analysisFileUrl) return { isAvailable: false, reason: messages.SHEET_PREPARING };
    return { isAvailable: true, reason: null };
  }

  private static toAssignment(resolved: Practice.ResolvedAssignment, pieceBpm: number): NonNullable<Practice.ContextDTO['assignment']> {
    const { candidate, state, usedSubmissions } = resolved;
    return {
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      deadline: candidate.deadline.toISOString(),
      maxSubmissions: candidate.maxSubmissions,
      usedSubmissions,
      remainingSubmissions: Math.max(0, candidate.maxSubmissions - usedSubmissions),
      targetBpm: candidate.targetBpm ?? pieceBpm,
      state,
      countsTowardAssignment: state === 'OPEN'
    };
  }
}
