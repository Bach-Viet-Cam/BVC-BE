import AppError from '../../../utils/AppError.ts';
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
}

export interface EnsembleTracksResult extends Omit<PracticeContext, 'assignmentId'> {
  mySheetMusicId: string | null;
  tracks: EnsembleTrackItem[];
}

export default class EnsembleService {
  static async resolveContext(studentId: string, pieceId: string, assignmentId?: string): Promise<PracticeContext> {
    const piece = await EnsembleRepository.findPiece(pieceId);
    if (!piece || !EnsemblePolicyService.canPracticePiece({ piece, isViaAssignment: Boolean(assignmentId) })) {
      throw AppError.notFound(EnsembleConstant.messages.PIECE_NOT_FOUND);
    }
    const memberships = await EnsembleRepository.findMemberships(studentId);
    if (memberships.length === 0) throw AppError.forbidden(EnsembleConstant.messages.NOT_A_MEMBER);
    if (!assignmentId) {
      const [membership] = memberships;
      return { pieceId, pieceTitle: piece.title, targetBpm: piece.bpm, myInstrumentId: membership.instrumentId, myInstrumentName: membership.instrument.name, assignmentId: null };
    }
    const assignment = await EnsembleRepository.findPublishedAssignment(assignmentId);
    const membership = assignment ? memberships.find((item) => item.classId === assignment.classId) : undefined;
    if (!assignment || !membership || assignment.sheetMusic?.pieceId !== pieceId) throw AppError.notFound(EnsembleConstant.messages.ASSIGNMENT_NOT_FOUND);
    const targetBpm = EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: assignment.targetBpm, pieceBpm: piece.bpm });
    return { pieceId, pieceTitle: piece.title, targetBpm, myInstrumentId: membership.instrumentId, myInstrumentName: membership.instrument.name, assignmentId };
  }

  static async getTracks(studentId: string, pieceId: string, assignmentId?: string): Promise<EnsembleTracksResult> {
    const context = await EnsembleService.resolveContext(studentId, pieceId, assignmentId);
    const tracks = EnsemblePolicyService.filterTracks({ tracks: await EnsembleRepository.findTracks(pieceId), studentInstrumentId: context.myInstrumentId });
    if (tracks.length === 0) throw AppError.notFound(EnsembleConstant.messages.NO_TRACKS);
    const mySheetMusicId = await EnsembleRepository.findReadyMainSheetId(pieceId, context.myInstrumentId);
    return {
      pieceId: context.pieceId,
      pieceTitle: context.pieceTitle,
      targetBpm: context.targetBpm,
      myInstrumentId: context.myInstrumentId,
      myInstrumentName: context.myInstrumentName,
      mySheetMusicId,
      tracks: tracks.map(EnsembleDTO.toTrackItem)
    };
  }
}
