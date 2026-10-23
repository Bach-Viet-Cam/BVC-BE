import StorageService from '../../../lib/storage/StorageService.ts';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import type { PieceAvailability } from '../service/EnsemblePolicyService.ts';

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

  static async findPiece(pieceId: string): Promise<({ id: string; title: string; bpm: number } & PieceAvailability) | null> {
    return EnsembleRepository.client.piece.findUnique({
      where: { id: pieceId },
      select: { id: true, title: true, bpm: true, visibility: true, moderation: true, deletedAt: true }
    });
  }

  static async findTracks(pieceId: string): Promise<EnsembleTrackRecord[]> {
    const mainSheets = await EnsembleRepository.client.sheetMusic.findMany({
      where: {
        pieceId,
        kind: 'MAIN',
        referenceAudioId: { not: null },
        moderation: 'NORMAL'
      },
      select: {
        id: true,
        instrumentId: true,
        durationSec: true,
        referenceAudio: {
          select: {
            storageKey: true,
            durationSec: true
          }
        },
        instrument: { select: { name: true } }
      },
      orderBy: { instrument: { name: 'asc' } }
    });

    return mainSheets.map((sheet) => ({
      id: sheet.id,
      instrumentId: sheet.instrumentId,
      fileUrl: sheet.referenceAudio?.storageKey ? StorageService.driver.createReadUrl(sheet.referenceAudio.storageKey) : '',
      durationSec: sheet.referenceAudio?.durationSec ?? sheet.durationSec ?? 0,
      offsetMs: 0,
      defaultVolume: 1,
      instrument: sheet.instrument
    }));
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
