import PrismaClientProvider from '../../../config/PrismaClient.ts';

export interface EnsembleTrackRecord {
  id: string;
  instrumentId: string;
  fileUrl: string;
  durationSec: number;
  offsetMs: number;
  defaultVolume: number;
  instrument: { name: string };
}

export interface EnsembleSessionRecord {
  id: string;
  pieceId: string;
  instrumentId: string;
  assignmentId: string | null;
  recordingUrl: string | null;
  trackSettings: unknown;
  targetBpm: number;
  status: 'RECORDING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
}

export default class EnsembleRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findPiece(pieceId: string): Promise<{ id: string; title: string; bpm: number } | null> {
    return EnsembleRepository.client.piece.findUnique({ where: { id: pieceId }, select: { id: true, title: true, bpm: true } });
  }

  static async findTracks(pieceId: string): Promise<EnsembleTrackRecord[]> {
    return EnsembleRepository.client.ensembleTrack.findMany({
      where: { pieceId },
      select: { id: true, instrumentId: true, fileUrl: true, durationSec: true, offsetMs: true, defaultVolume: true, instrument: { select: { name: true } } },
      orderBy: { instrument: { name: 'asc' } }
    });
  }

  static async findMemberships(userId: string): Promise<{ classId: string; instrumentId: string; instrument: { name: string } }[]> {
    return EnsembleRepository.client.classMember.findMany({
      where: { userId },
      select: { classId: true, instrumentId: true, instrument: { select: { name: true } } },
      orderBy: { createdAt: 'asc' }
    });
  }

  static async findPublishedAssignment(assignmentId: string): Promise<{ id: string; classId: string; pieceId: string | null; targetBpm: number | null } | null> {
    return EnsembleRepository.client.assignment.findFirst({
      where: { id: assignmentId, isPublished: true },
      select: { id: true, classId: true, pieceId: true, targetBpm: true }
    });
  }

  static async createSession(input: { studentId: string; pieceId: string; instrumentId: string; assignmentId: string | null; recordingUrl: string; trackSettings: unknown; targetBpm: number }): Promise<EnsembleSessionRecord> {
    return EnsembleRepository.client.ensembleSession.create({
      data: { ...input, trackSettings: input.trackSettings as object, status: 'COMPLETED' }
    });
  }

  static async findSessionOfStudent(sessionId: string, studentId: string): Promise<EnsembleSessionRecord | null> {
    return EnsembleRepository.client.ensembleSession.findFirst({ where: { id: sessionId, studentId } });
  }
}
