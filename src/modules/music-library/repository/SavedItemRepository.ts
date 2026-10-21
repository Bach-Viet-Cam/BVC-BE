import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import MusicLibraryModel from '../model/MusicLibraryModel.ts';

export default class SavedItemRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  // GBR-42: hidden pieces / sheets are filtered when reading; the saved_item rows stay untouched
  static buildVisibleWhere(studentId: string, targetType: MusicLibrary.SavedTargetType): Prisma.SavedItemWhereInput {
    return targetType === 'PIECE'
      ? { studentId, targetType, piece: MusicLibraryModel.visiblePieceWhere }
      : { studentId, targetType, sheetMusic: MusicLibraryModel.visibleSheetMusicWhere };
  }

  // R-06: saving twice is a no-op thanks to the (student, type, target) unique key
  static async save(studentId: string, targetType: MusicLibrary.SavedTargetType, targetId: string): Promise<void> {
    await SavedItemRepository.client.savedItem.createMany({
      data: [{
        studentId,
        targetType,
        targetId,
        pieceId: targetType === 'PIECE' ? targetId : null,
        sheetMusicId: targetType === 'SHEET_MUSIC' ? targetId : null
      }],
      skipDuplicates: true
    });
  }

  static async remove(studentId: string, targetType: MusicLibrary.SavedTargetType, targetId: string): Promise<void> {
    await SavedItemRepository.client.savedItem.deleteMany({ where: { studentId, targetType, targetId } });
  }

  static async listVisible(studentId: string, query: MusicLibrary.SavedQuery): Promise<[MusicLibrary.SavedItemRecord[], number]> {
    const where = SavedItemRepository.buildVisibleWhere(studentId, query.type);
    return SavedItemRepository.client.$transaction([
      SavedItemRepository.client.savedItem.findMany({
        where,
        select: MusicLibraryModel.savedItemSelect,
        orderBy: [{ savedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      SavedItemRepository.client.savedItem.count({ where })
    ]);
  }

  static async countVisible(studentId: string, targetType: MusicLibrary.SavedTargetType): Promise<number> {
    return SavedItemRepository.client.savedItem.count({ where: SavedItemRepository.buildVisibleWhere(studentId, targetType) });
  }

  static async findSavedTargetIds(studentId: string, targetType: MusicLibrary.SavedTargetType, targetIds: string[]): Promise<Set<string>> {
    if (targetIds.length === 0) return new Set();
    const savedRows = await SavedItemRepository.client.savedItem.findMany({
      where: { studentId, targetType, targetId: { in: targetIds } },
      select: { targetId: true }
    });
    return new Set(savedRows.map((savedRow) => savedRow.targetId));
  }
}
