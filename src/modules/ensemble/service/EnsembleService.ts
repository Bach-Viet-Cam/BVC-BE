import path from 'node:path';
import AppError from '../../../utils/AppError.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import EnsembleConstant from '../constant/EnsembleConstant.ts';
import EnsembleDTO, { type EnsembleSessionItem, type EnsembleTrackItem } from '../dto/EnsembleDTO.ts';
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
  tracks: EnsembleTrackItem[];
}

export interface CreateSessionInput {
  pieceId: string;
  assignmentId?: string;
  trackSettings: string;
}

export interface UploadedRecording {
  filename: string;
  size: number;
  originalname: string;
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
    if (!assignment || !membership || assignment.pieceId !== pieceId) throw AppError.notFound(EnsembleConstant.messages.ASSIGNMENT_NOT_FOUND);
    const targetBpm = EnsemblePolicyService.resolveTargetBpm({ assignmentBpm: assignment.targetBpm, pieceBpm: piece.bpm });
    return { pieceId, pieceTitle: piece.title, targetBpm, myInstrumentId: membership.instrumentId, myInstrumentName: membership.instrument.name, assignmentId };
  }

  static async getTracks(studentId: string, pieceId: string, assignmentId?: string): Promise<EnsembleTracksResult> {
    const context = await EnsembleService.resolveContext(studentId, pieceId, assignmentId);
    const tracks = EnsemblePolicyService.filterTracks({ tracks: await EnsembleRepository.findTracks(pieceId), studentInstrumentId: context.myInstrumentId });
    if (tracks.length === 0) throw AppError.notFound(EnsembleConstant.messages.NO_TRACKS);
    return {
      pieceId: context.pieceId,
      pieceTitle: context.pieceTitle,
      targetBpm: context.targetBpm,
      myInstrumentId: context.myInstrumentId,
      myInstrumentName: context.myInstrumentName,
      tracks: tracks.map(EnsembleDTO.toTrackItem)
    };
  }

  static async createSession(studentId: string, input: CreateSessionInput, file: UploadedRecording | undefined): Promise<EnsembleSessionItem> {
    if (!file) throw AppError.badRequest(EnsembleConstant.messages.RECORDING_REQUIRED);
    const [maxMb, formats] = await Promise.all([SystemConfigService.getNumber('max_recording_mb'), SystemConfigService.getStringList('allowed_recording_formats')]);
    const upload = EnsemblePolicyService.validateUpload({ sizeBytes: file.size, extension: path.extname(file.originalname), maxMb, formats });
    if (!upload.isValid) throw AppError.badRequest(upload.message);
    const trackSettings = EnsemblePolicyService.parseTrackSettings(input.trackSettings);
    if (!trackSettings) throw AppError.badRequest(EnsembleConstant.messages.TRACK_SETTINGS_INVALID);
    const context = await EnsembleService.resolveContext(studentId, input.pieceId, input.assignmentId);
    const session = await EnsembleRepository.createSession({
      studentId,
      pieceId: context.pieceId,
      instrumentId: context.myInstrumentId,
      assignmentId: context.assignmentId,
      recordingUrl: `/uploads/recordings/${file.filename}`,
      trackSettings,
      targetBpm: context.targetBpm
    });
    return EnsembleDTO.toSessionItem(session);
  }

  static async getSession(studentId: string, sessionId: string): Promise<EnsembleSessionItem> {
    const session = await EnsembleRepository.findSessionOfStudent(sessionId, studentId);
    if (!session) throw AppError.notFound(EnsembleConstant.messages.SESSION_NOT_FOUND);
    return EnsembleDTO.toSessionItem(session);
  }
}
