import StorageService from '../../../lib/storage/StorageService.ts';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PracticeSubmissionRepository from '../../practice/repository/PracticeSubmissionRepository.ts';
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

  // Cùng luật với PracticeSubmissionRepository.findClassAssignments: lớp đang theo học mới nhất, bỏ lớp đã bị xóa khỏi
  static async findCurrentMembership(userId: string): Promise<{ classId: string; instrumentId: string; instrument: { name: string } } | null> {
    return EnsembleRepository.client.classMember.findFirst({
      where: { userId, removedAt: null },
      orderBy: { class: { startDate: 'desc' } },
      select: { classId: true, instrumentId: true, instrument: { select: { name: true } } }
    });
  }

  // The student's classes with the published or closed assignments of this piece and the student's own submissions,
  // the same data the practice submission uses to decide which assignment a send counts toward
  static async findEnrollments(studentId: string, pieceId: string): Promise<Practice.ClassAssignments[]> {
    return new PracticeSubmissionRepository(EnsembleRepository.client).findClassAssignments(studentId, pieceId);
  }

  static async findInstrumentName(instrumentId: string): Promise<string | null> {
    const instrument = await EnsembleRepository.client.instrument.findUnique({ where: { id: instrumentId }, select: { name: true } });
    return instrument?.name ?? null;
  }

  static async findReadyMainSheetId(pieceId: string, instrumentId: string): Promise<string | null> {
    const sheet = await EnsembleRepository.client.sheetMusic.findFirst({
      where: {
        pieceId,
        instrumentId,
        kind: 'MAIN',
        moderation: 'NORMAL',
        referenceAudio: { status: 'READY' }
      },
      select: { id: true }
    });
    return sheet?.id ?? null;
  }
}
