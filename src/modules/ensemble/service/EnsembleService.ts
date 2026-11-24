import AppError from '../../../utils/AppError.ts';
import PracticeAssignmentResolver from '../../practice/service/PracticeAssignmentResolver.ts';
import EnsembleConstant from '../constant/EnsembleConstant.ts';
import EnsembleDTO, { type EnsembleTrackItem } from '../dto/EnsembleDTO.ts';
import EnsembleRepository from '../repository/EnsembleRepository.ts';
import EnsemblePolicyService from './EnsemblePolicyService.ts';

export interface PracticeContext {
  pieceId: string;
  pieceTitle: string;
  targetBpm: number;
  myInstrumentId: string;
  myInstrumentName: string;
  assignmentId: string | null;
  isAssignmentCounted: boolean;
}

export interface EnsembleTracksResult extends PracticeContext {
  mySheetMusicId: string | null;
  tracks: EnsembleTrackItem[];
}

export default class EnsembleService {
  // An opened assignment is looked up in the class that holds it, so an assignment of an ended class still opens
  // (not counted). Without one, the take counts toward the assignment a submission of the student's own main sheet
  // would count toward (GBR-25), so the screen shows the same thing the submission will do.
  static async resolveContext(studentId: string, pieceId: string, assignmentId?: string, now: Date = new Date()): Promise<PracticeContext> {
    const piece = await EnsembleRepository.findPiece(pieceId);
    if (!piece || !EnsemblePolicyService.canPracticePiece({ piece, isViaAssignment: Boolean(assignmentId) })) {
      throw AppError.notFound(EnsembleConstant.messages.PIECE_NOT_FOUND);
    }
    const membership = await EnsembleRepository.findCurrentMembership(studentId);
    if (!membership) throw AppError.forbidden(EnsembleConstant.messages.NOT_A_MEMBER);
    const enrollments = await EnsembleRepository.findEnrollments(studentId, pieceId);
    const base = { pieceId, pieceTitle: piece.title };

    if (assignmentId) {
      const enrollment = enrollments.find((item) => item.assignments.some((candidate) => candidate.id === assignmentId));
      const candidate = enrollment?.assignments.find((item) => item.id === assignmentId);
      if (!enrollment || !candidate) throw AppError.notFound(EnsembleConstant.messages.ASSIGNMENT_NOT_FOUND);
      const { state } = PracticeAssignmentResolver.stateOf(candidate, enrollment.classRecord.status, now);
      return {
        ...base,
        targetBpm: EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: candidate.targetBpm, pieceBpm: piece.bpm }),
        myInstrumentId: enrollment.memberInstrumentId,
        myInstrumentName: await EnsembleService.instrumentName(enrollment.memberInstrumentId, membership),
        assignmentId,
        isAssignmentCounted: EnsemblePolicyService.isCountedAssignment({ kind: candidate.currentVersion?.kind, state })
      };
    }

    const ownMainSheet = { kind: 'MAIN' as const, instrumentId: membership.instrumentId };
    const enrollment = PracticeAssignmentResolver.pickEnrollment(enrollments, ownMainSheet);
    const resolved = PracticeAssignmentResolver.resolve(ownMainSheet, enrollment, now, undefined, 'ENSEMBLE');
    const counted = resolved && EnsemblePolicyService.isCountedAssignment({ kind: resolved.candidate.currentVersion?.kind, state: resolved.state })
      ? resolved.candidate : null;
    return {
      ...base,
      targetBpm: EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: counted?.targetBpm ?? null, pieceBpm: piece.bpm }),
      myInstrumentId: membership.instrumentId,
      myInstrumentName: membership.instrument.name,
      assignmentId: counted?.id ?? null,
      isAssignmentCounted: Boolean(counted)
    };
  }

  static async getTracks(studentId: string, pieceId: string, assignmentId?: string): Promise<EnsembleTracksResult> {
    const context = await EnsembleService.resolveContext(studentId, pieceId, assignmentId);
    const tracks = EnsemblePolicyService.filterTracks({ tracks: await EnsembleRepository.findTracks(pieceId), studentInstrumentId: context.myInstrumentId });
    if (tracks.length === 0) throw AppError.notFound(EnsembleConstant.messages.NO_TRACKS);
    const mySheetMusicId = await EnsembleRepository.findReadyMainSheetId(pieceId, context.myInstrumentId);
    return { ...context, mySheetMusicId, tracks: tracks.map(EnsembleDTO.toTrackItem) };
  }

  private static async instrumentName(instrumentId: string, membership: { instrumentId: string; instrument: { name: string } }): Promise<string> {
    if (instrumentId === membership.instrumentId) return membership.instrument.name;
    return (await EnsembleRepository.findInstrumentName(instrumentId)) ?? '';
  }
}
