import MessageConstant from '../../../constants/MessageConstant.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import MusicLibraryDTO from '../dto/MusicLibraryDTO.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SavedItemRepository from '../repository/SavedItemRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import SheetMusicService from './SheetMusicService.ts';
import StudentClassService from './StudentClassService.ts';

const MESSAGES = MusicLibraryConstant.messages;

// Guests have no viewer; isSaved / defaultInstrumentId are only computed for students
type LibraryViewer = Backend.UserDTO | undefined;

export default class LibraryService {
  static getStudentId(viewer: LibraryViewer): string | null {
    return viewer?.role === MusicLibraryConstant.roles.STUDENT ? viewer.userId : null;
  }

  static async findSavedIds(viewer: LibraryViewer, targetType: MusicLibrary.SavedTargetType, targetIds: string[]): Promise<Set<string>> {
    const studentId = LibraryService.getStudentId(viewer);
    return studentId ? SavedItemRepository.findSavedTargetIds(studentId, targetType, targetIds) : new Set();
  }

  static hasActiveFilters(query: MusicLibrary.LibraryPieceQuery): boolean {
    return Boolean(query.q?.trim()) || query.genreIds.length + query.instrumentIds.length + query.levelIds.length > 0;
  }

  static async buildEmptyState(query: MusicLibrary.LibraryPieceQuery, total: number): Promise<MusicLibrary.WarningDTO | null> {
    if (total > 0) return null;
    if (LibraryService.hasActiveFilters(query) && await PieceRepository.countLibrary() > 0) {
      return { code: 'MSG-07', message: MessageConstant.format('MSG-07', { item: 'bài hát' }) };
    }
    return { code: 'MSG-06', message: MessageConstant.format('MSG-06', { subject: 'Thư viện', item: 'bài hát' }) };
  }

  static async listPieces(viewer: LibraryViewer, query: MusicLibrary.LibraryPieceQuery) {
    const [pieces, total] = await PieceRepository.listLibrary(query);
    const pieceIds = pieces.map(({ id }) => id);
    const [instrumentPairs, savedPieceIds] = await Promise.all([
      PieceRepository.findVisibleInstrumentPairs(pieceIds),
      LibraryService.findSavedIds(viewer, 'PIECE', pieceIds)
    ]);
    const pieceCards = await Promise.all(pieces.map((piece) => MusicLibraryDTO.toLibraryPieceCard(
      piece,
      instrumentPairs.filter((instrumentPair) => instrumentPair.pieceId === piece.id).length,
      savedPieceIds.has(piece.id)
    )));
    return { ...MusicLibraryDTO.toPaginated(pieceCards, total, query), emptyState: await LibraryService.buildEmptyState(query, total) };
  }

  static async buildMainCard(mainSheetMusic: MusicLibrary.SheetMusicRecord | undefined, savedSheetIds: Set<string>) {
    if (!mainSheetMusic) return null;
    return {
      ...MusicLibraryDTO.toLibrarySheetCard(mainSheetMusic, savedSheetIds.has(mainSheetMusic.id)),
      referenceAudio: await MusicLibraryDTO.toPlayableMedia(mainSheetMusic.referenceAudio),
      tutorialVideo: await MusicLibraryDTO.toPlayableMedia(mainSheetMusic.tutorialVideo)
    };
  }

  // R-07: the student's class instrument when the piece has that tab, otherwise the first tab
  static async resolveDefaultInstrumentId(viewer: LibraryViewer, tabInstrumentIds: string[]): Promise<string | null> {
    const studentId = LibraryService.getStudentId(viewer);
    const classInstrumentId = studentId ? await StudentClassService.findActiveInstrumentId(studentId) : null;
    if (classInstrumentId && tabInstrumentIds.includes(classInstrumentId)) return classInstrumentId;
    return tabInstrumentIds[0] ?? null;
  }

  static async getPieceDetail(viewer: LibraryViewer, pieceId: string) {
    const piece = await PieceRepository.findVisibleById(pieceId);
    if (!piece) throw AppError.withMessage(404, 'MSG-08', MESSAGES.PIECE_NOT_PUBLIC);
    const sheetMusicList = SheetMusicService.sortSheetMusic(await SheetMusicRepository.listVisibleByPiece(pieceId));
    const [savedPieceIds, savedSheetIds] = await Promise.all([
      LibraryService.findSavedIds(viewer, 'PIECE', [pieceId]),
      LibraryService.findSavedIds(viewer, 'SHEET_MUSIC', sheetMusicList.map(({ id }) => id))
    ]);
    const tabInstruments = piece.instruments
      .map(({ instrument }) => instrument)
      .filter((instrument) => sheetMusicList.some((sheetMusic) => sheetMusic.instrumentId === instrument.id));
    const tabs = await Promise.all(tabInstruments.map(async (instrument) => {
      const instrumentSheets = sheetMusicList.filter((sheetMusic) => sheetMusic.instrumentId === instrument.id);
      const mainSheetMusic = instrumentSheets.find((sheetMusic) => sheetMusic.kind === 'MAIN');
      return {
        instrument: MusicLibraryDTO.toCategoryRef(instrument),
        sheetMusicCount: instrumentSheets.length,
        main: await LibraryService.buildMainCard(mainSheetMusic, savedSheetIds),
        others: instrumentSheets
          .filter((sheetMusic) => sheetMusic.kind !== 'MAIN')
          .map((sheetMusic) => MusicLibraryDTO.toLibrarySheetCard(sheetMusic, savedSheetIds.has(sheetMusic.id)))
      };
    }));
    return {
      ...await MusicLibraryDTO.toLibraryPieceCard(piece, tabs.length, savedPieceIds.has(pieceId)),
      description: piece.description,
      // "Luyện hòa tấu" needs at least one public main sheet with a reference recording
      canPracticeEnsemble: tabs.some((tab) => tab.main?.referenceAudio),
      defaultInstrumentId: await LibraryService.resolveDefaultInstrumentId(viewer, tabs.map((tab) => tab.instrument.id)),
      tabs
    };
  }

  // A level sheet without its own recording plays the main sheet's recording of the same instrument
  static async findFallbackAudio(sheetMusic: MusicLibrary.SheetMusicWithPieceRecord): Promise<MusicLibrary.MediaFileRecord | null> {
    if (sheetMusic.referenceAudio || sheetMusic.kind === 'MAIN') return null;
    const mainSheetMusic = await SheetMusicRepository.findMain(sheetMusic.pieceId, sheetMusic.instrumentId);
    if (!mainSheetMusic || mainSheetMusic.moderation !== 'NORMAL') return null;
    return mainSheetMusic.referenceAudio;
  }

  static buildPracticeState(sheetMusic: MusicLibrary.SheetMusicRecord) {
    if (sheetMusic.kind !== 'MAIN') return { isAvailable: false, reason: 'Hãy luyện bản chính của nhạc cụ này.' };
    if (!sheetMusic.analysisFileUrl) return { isAvailable: false, reason: 'Bản nhạc đang được chuẩn bị, vui lòng quay lại sau.' };
    return { isAvailable: true, reason: null };
  }

  static async getSheetMusicViewer(viewer: LibraryViewer, sheetMusicId: string) {
    const sheetMusic = await SheetMusicRepository.findVisibleById(sheetMusicId);
    if (!sheetMusic) throw AppError.withMessage(404, 'MSG-08', MESSAGES.SHEET_NOT_PUBLIC);
    const [savedSheetIds, fallbackAudio] = await Promise.all([
      LibraryService.findSavedIds(viewer, 'SHEET_MUSIC', [sheetMusicId]),
      LibraryService.findFallbackAudio(sheetMusic)
    ]);
    const tutorialVideo = await MusicLibraryDTO.toPlayableMedia(sheetMusic.tutorialVideo);
    return {
      sheetMusic: {
        ...MusicLibraryDTO.toLibrarySheetCard(sheetMusic, savedSheetIds.has(sheetMusicId)),
        instrument: MusicLibraryDTO.toCategoryRef(sheetMusic.instrument)
      },
      piece: {
        id: sheetMusic.piece.id,
        title: sheetMusic.piece.title,
        coverUrl: await MusicLibraryDTO.toCoverUrl(sheetMusic.piece.coverFile)
      },
      sheetFile: await MusicLibraryDTO.toMediaFile(sheetMusic.sheetFile),
      referenceAudio: sheetMusic.referenceAudio
        ? await MusicLibraryDTO.toPlayableMedia(sheetMusic.referenceAudio)
        : await MusicLibraryDTO.toPlayableMedia(fallbackAudio, true),
      tutorialVideo,
      defaultMediaTab: tutorialVideo ? 'TUTORIAL_VIDEO' : 'REFERENCE_AUDIO',
      practice: LibraryService.buildPracticeState(sheetMusic)
    };
  }
}
