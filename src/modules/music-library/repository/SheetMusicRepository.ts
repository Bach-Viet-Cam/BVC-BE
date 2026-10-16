import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import MusicLibraryModel from '../model/MusicLibraryModel.ts';

export default class SheetMusicRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async create(
    sheetMusicData: Prisma.SheetMusicUncheckedCreateInput,
    database: MusicLibrary.DbClient = SheetMusicRepository.client
  ): Promise<MusicLibrary.SheetMusicRecord> {
    return database.sheetMusic.create({ data: sheetMusicData, select: MusicLibraryModel.sheetMusicSelect });
  }

  static async update(
    sheetMusicId: string,
    sheetMusicData: Prisma.SheetMusicUncheckedUpdateInput,
    database: MusicLibrary.DbClient = SheetMusicRepository.client
  ): Promise<MusicLibrary.SheetMusicRecord> {
    return database.sheetMusic.update({ where: { id: sheetMusicId }, data: sheetMusicData, select: MusicLibraryModel.sheetMusicSelect });
  }

  // Conditional update used by the AI callback: only applies while the job is still current
  static async updateIfJobMatches(
    sheetMusicId: string,
    jobId: string,
    sheetMusicData: Prisma.SheetMusicUncheckedUpdateInput
  ): Promise<boolean> {
    const updateResult = await SheetMusicRepository.client.sheetMusic.updateMany({
      where: { id: sheetMusicId, analysisJobId: jobId },
      data: sheetMusicData
    });
    return updateResult.count > 0;
  }

  static async findById(sheetMusicId: string): Promise<MusicLibrary.SheetMusicWithPieceRecord | null> {
    return SheetMusicRepository.client.sheetMusic.findUnique({
      where: { id: sheetMusicId },
      select: MusicLibraryModel.sheetMusicWithPieceSelect
    });
  }

  static async listByPiece(pieceId: string): Promise<MusicLibrary.SheetMusicRecord[]> {
    return SheetMusicRepository.client.sheetMusic.findMany({
      where: { pieceId },
      select: MusicLibraryModel.sheetMusicSelect,
      orderBy: [{ createdAt: 'asc' }]
    });
  }

  static async listVisibleByPiece(pieceId: string): Promise<MusicLibrary.SheetMusicRecord[]> {
    return SheetMusicRepository.client.sheetMusic.findMany({
      where: { pieceId, ...MusicLibraryModel.visibleSheetMusicWhere },
      select: MusicLibraryModel.sheetMusicSelect,
      orderBy: [{ createdAt: 'asc' }]
    });
  }

  static async findVisibleById(sheetMusicId: string): Promise<MusicLibrary.SheetMusicWithPieceRecord | null> {
    return SheetMusicRepository.client.sheetMusic.findFirst({
      where: { id: sheetMusicId, ...MusicLibraryModel.visibleSheetMusicWhere },
      select: MusicLibraryModel.sheetMusicWithPieceSelect
    });
  }

  static async findMain(pieceId: string, instrumentId: string): Promise<MusicLibrary.SheetMusicRecord | null> {
    return SheetMusicRepository.client.sheetMusic.findFirst({
      where: { pieceId, instrumentId, kind: 'MAIN' },
      select: MusicLibraryModel.sheetMusicSelect
    });
  }

  static async findByName(pieceId: string, name: string, excludedSheetMusicId?: string): Promise<{ id: string } | null> {
    return SheetMusicRepository.client.sheetMusic.findFirst({
      where: {
        pieceId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludedSheetMusicId ? { id: { not: excludedSheetMusicId } } : {})
      },
      select: { id: true }
    });
  }

  static async countVisibleByPiece(pieceId: string): Promise<number> {
    return SheetMusicRepository.client.sheetMusic.count({ where: { pieceId, visibility: 'PUBLIC', moderation: 'NORMAL' } });
  }

  static async findInstrumentIdsInUse(pieceId: string, instrumentIds: string[]): Promise<string[]> {
    const sheetRows = await SheetMusicRepository.client.sheetMusic.findMany({
      where: { pieceId, instrumentId: { in: instrumentIds } },
      select: { instrumentId: true },
      distinct: ['instrumentId']
    });
    return sheetRows.map((sheetRow) => sheetRow.instrumentId);
  }

  static async findForAnalysis(sheetMusicId: string) {
    return SheetMusicRepository.client.sheetMusic.findUnique({
      where: { id: sheetMusicId },
      select: {
        id: true,
        kind: true,
        analysisJobId: true,
        uploaderId: true,
        name: true,
        piece: { select: { id: true, ownerId: true, title: true } },
        instrument: { select: MusicLibraryModel.instrumentRefSelect },
        sheetFile: { select: MusicLibraryModel.mediaFileSelect },
        referenceAudio: { select: MusicLibraryModel.mediaFileSelect },
        analysisFileUrl: true
      }
    });
  }
}
