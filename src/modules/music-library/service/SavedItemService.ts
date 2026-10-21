import MessageConstant from '../../../constants/MessageConstant.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import MusicLibraryDTO from '../dto/MusicLibraryDTO.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SavedItemRepository from '../repository/SavedItemRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';

const MESSAGES = MusicLibraryConstant.messages;

export default class SavedItemService {
  static async savePiece(studentId: string, pieceId: string): Promise<void> {
    if (!await PieceRepository.findVisibleById(pieceId)) throw AppError.withMessage(404, 'MSG-08', MESSAGES.PIECE_NOT_PUBLIC);
    await SavedItemRepository.save(studentId, 'PIECE', pieceId);
  }

  static async saveSheetMusic(studentId: string, sheetMusicId: string): Promise<void> {
    if (!await SheetMusicRepository.findVisibleById(sheetMusicId)) throw AppError.withMessage(404, 'MSG-08', MESSAGES.SHEET_NOT_PUBLIC);
    await SavedItemRepository.save(studentId, 'SHEET_MUSIC', sheetMusicId);
  }

  static async unsave(studentId: string, targetType: MusicLibrary.SavedTargetType, targetId: string): Promise<void> {
    await SavedItemRepository.remove(studentId, targetType, targetId);
  }

  static async listSaved(studentId: string, query: MusicLibrary.SavedQuery) {
    const [[savedItems, total], pieceCount, sheetMusicCount] = await Promise.all([
      SavedItemRepository.listVisible(studentId, query),
      SavedItemRepository.countVisible(studentId, 'PIECE'),
      SavedItemRepository.countVisible(studentId, 'SHEET_MUSIC')
    ]);
    const items = query.type === 'PIECE'
      ? await Promise.all(savedItems.map(MusicLibraryDTO.toSavedPiece))
      : await Promise.all(savedItems.map(MusicLibraryDTO.toSavedSheetMusic));
    const itemLabel = query.type === 'PIECE' ? 'bài hát' : 'bản nhạc';
    return {
      ...MusicLibraryDTO.toPaginated<unknown>(items, total, query),
      counts: { PIECE: pieceCount, SHEET_MUSIC: sheetMusicCount },
      emptyState: total === 0
        ? { code: 'MSG-06', message: MessageConstant.format('MSG-06', { subject: 'Danh sách đã lưu', item: itemLabel }) }
        : null
    };
  }
}
