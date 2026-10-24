import AppError from '../../../utils/AppError.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';
import PracticeAssignmentResolver from './PracticeAssignmentResolver.ts';

const { messages } = PracticeConstant;

// Settings the record screen needs before recording: the tempo to practise at and the strings to tune
export default class PracticeSettingsService {
  constructor(
    private readonly repository: PracticeSubmissionRepository = new PracticeSubmissionRepository(),
    private readonly now: () => Date = () => new Date()
  ) {}

  // The assignment's target BPM when this sheet is assigned to the student's class and the lecturer set one;
  // otherwise (no class, not assigned, no BPM saved) the default tempo
  async getTargetBpm(studentId: string, query: { sheetMusicId: string; assignmentId?: string }): Promise<Practice.TargetBpmDTO> {
    const sheet = await this.findSheet(query.sheetMusicId);
    const enrollments = await this.repository.findClassAssignments(studentId, sheet.piece.id);
    const enrollment = PracticeAssignmentResolver.pickEnrollment(enrollments, sheet, query.assignmentId);
    const resolved = PracticeAssignmentResolver.resolve(sheet, enrollment, this.now(), query.assignmentId);
    const assignmentBpm = resolved?.candidate.targetBpm ?? null;
    if (resolved && assignmentBpm !== null && assignmentBpm > 0) {
      return { targetBpm: assignmentBpm, source: 'ASSIGNMENT', assignmentId: resolved.candidate.id };
    }
    return { targetBpm: PracticeConstant.defaultTargetBpm, source: 'DEFAULT', assignmentId: resolved?.candidate.id ?? null };
  }

  async getTunes(sheetMusicId: string): Promise<Practice.InstrumentTunesDTO> {
    const sheet = await this.findSheet(sheetMusicId);
    const tunes = await this.repository.findInstrumentTunes(sheet.instrument.id);
    return {
      instrument: { id: sheet.instrument.id, name: sheet.instrument.name },
      tunes: tunes.map((tune) => ({ id: tune.id, name: tune.tuneName, pitchHz: tune.pitch, displayOrder: tune.displayOrder }))
    };
  }

  private async findSheet(sheetMusicId: string): Promise<Practice.ContextSheet> {
    const sheet = await this.repository.findContextSheet(sheetMusicId);
    if (!sheet) throw AppError.notFound(messages.SHEET_NOT_FOUND);
    return sheet;
  }
}
