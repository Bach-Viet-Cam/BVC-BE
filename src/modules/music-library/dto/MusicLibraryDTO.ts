import StorageService from '../../../lib/storage/StorageService.ts';

type PieceSheetSummary = Pick<MusicLibrary.PieceRecord['sheetMusic'][number], 'visibility' | 'moderation'>;

export default class MusicLibraryDTO {
  static toCategoryRef(category: { id: string; name: string }): MusicLibrary.CategoryRefDTO {
    return { id: category.id, name: category.name };
  }

  static toEffectiveVisibility(visibility: MusicLibrary.Visibility, moderation: string): 'PUBLIC' | 'HIDDEN' | 'ADMIN_HIDDEN' {
    return moderation === 'ADMIN_HIDDEN' ? 'ADMIN_HIDDEN' : visibility;
  }

  static async toReadUrl(mediaFile: MusicLibrary.MediaFileRecord | null | undefined): Promise<string | null> {
    if (!mediaFile || mediaFile.status !== 'READY') return null;
    return StorageService.driver.createReadUrl(mediaFile.storageKey);
  }

  static async toCoverUrl(coverFile: MusicLibrary.MediaFileRecord | null | undefined): Promise<string | null> {
    return MusicLibraryDTO.toReadUrl(coverFile);
  }

  static async toMediaFile(mediaFile: MusicLibrary.MediaFileRecord): Promise<MusicLibrary.MediaFileDTO>;
  static async toMediaFile(mediaFile: MusicLibrary.MediaFileRecord | null | undefined): Promise<MusicLibrary.MediaFileDTO | null>;
  static async toMediaFile(mediaFile: MusicLibrary.MediaFileRecord | null | undefined): Promise<MusicLibrary.MediaFileDTO | null> {
    if (!mediaFile) return null;
    return {
      id: mediaFile.id,
      name: mediaFile.originalName,
      mimeType: mediaFile.mimeType,
      sizeBytes: mediaFile.sizeBytes,
      durationSec: mediaFile.durationSec,
      pageCount: mediaFile.pageCount,
      url: await MusicLibraryDTO.toReadUrl(mediaFile)
    };
  }

  // A piece has no instrument list of its own: it is the distinct instruments of its sheet music, in input order
  static uniqueInstruments<TInstrument extends { id: string }>(sheetMusicList: { instrument: TInstrument }[]): TInstrument[] {
    const instrumentsById = new Map<string, TInstrument>();
    sheetMusicList.forEach(({ instrument }) => {
      if (!instrumentsById.has(instrument.id)) instrumentsById.set(instrument.id, instrument);
    });
    return [...instrumentsById.values()];
  }

  static isVisibleSheet(sheetSummary: PieceSheetSummary): boolean {
    return sheetSummary.visibility === 'PUBLIC' && sheetSummary.moderation === 'NORMAL';
  }

  // ----- Lecturer -----
  static async toLecturerPiece(piece: MusicLibrary.PieceRecord, viewerId: string) {
    const isAdminHidden = piece.moderation === 'ADMIN_HIDDEN';
    return {
      id: piece.id,
      title: piece.title,
      composer: piece.composer,
      description: piece.description,
      coverUrl: await MusicLibraryDTO.toCoverUrl(piece.coverFile),
      cover: await MusicLibraryDTO.toMediaFile(piece.coverFile),
      genre: MusicLibraryDTO.toCategoryRef(piece.genre),
      level: MusicLibraryDTO.toCategoryRef(piece.level),
      instruments: MusicLibraryDTO.uniqueInstruments(piece.sheetMusic).map(MusicLibraryDTO.toCategoryRef),
      visibility: piece.visibility,
      moderation: piece.moderation,
      effectiveVisibility: MusicLibraryDTO.toEffectiveVisibility(piece.visibility, piece.moderation),
      moderationReason: isAdminHidden ? piece.moderationReason : null,
      // R-01: only the owner edits the piece itself; any lecturer can add sheet music
      canEdit: piece.ownerId === viewerId,
      canChangeVisibility: !isAdminHidden,
      sheetMusicCount: piece.sheetMusic.length,
      publicSheetMusicCount: piece.sheetMusic.filter(MusicLibraryDTO.isVisibleSheet).length,
      createdAt: piece.createdAt.toISOString(),
      updatedAt: piece.updatedAt.toISOString()
    };
  }

  static async toLecturerSheetMusic(sheetMusic: MusicLibrary.SheetMusicRecord, canManage: boolean) {
    const isMain = sheetMusic.kind === 'MAIN';
    const isAdminHidden = sheetMusic.moderation === 'ADMIN_HIDDEN';
    const isMissingMainAudio = isMain && !sheetMusic.referenceAudio;
    return {
      id: sheetMusic.id,
      pieceId: sheetMusic.pieceId,
      name: sheetMusic.name,
      description: sheetMusic.description,
      kind: sheetMusic.kind,
      isMain,
      instrument: MusicLibraryDTO.toCategoryRef(sheetMusic.instrument),
      level: MusicLibraryDTO.toCategoryRef(sheetMusic.level),
      durationSec: sheetMusic.durationSec,
      visibility: sheetMusic.visibility,
      moderation: sheetMusic.moderation,
      effectiveVisibility: MusicLibraryDTO.toEffectiveVisibility(sheetMusic.visibility, sheetMusic.moderation),
      // The lecturer who uploaded the sheet and the piece owner may edit, hide or replace its files
      canManage,
      canChangeVisibility: canManage && !isAdminHidden,
      canPublish: !isAdminHidden && !isMissingMainAudio,
      files: {
        sheet: await MusicLibraryDTO.toMediaFile(sheetMusic.sheetFile),
        audio: await MusicLibraryDTO.toMediaFile(sheetMusic.referenceAudio),
        video: await MusicLibraryDTO.toMediaFile(sheetMusic.tutorialVideo)
      },
      usesMainRecording: !isMain && !sheetMusic.referenceAudio,
      analysis: isMain
        ? {
          status: sheetMusic.analysisStatus,
          error: sheetMusic.analysisError,
          hasAnalysisFile: Boolean(sheetMusic.analysisFileUrl),
          timeSignatureMissing: sheetMusic.timeSignatureMissing
        }
        : null,
      createdAt: sheetMusic.createdAt.toISOString(),
      updatedAt: sheetMusic.updatedAt.toISOString()
    };
  }

  // ----- Library (guest / student) -----
  static async toLibraryPieceCard(piece: MusicLibrary.LibraryPieceRecord, instrumentCount: number, isSaved: boolean) {
    return {
      id: piece.id,
      title: piece.title,
      composer: piece.composer,
      coverUrl: await MusicLibraryDTO.toCoverUrl(piece.coverFile),
      genre: MusicLibraryDTO.toCategoryRef(piece.genre),
      level: MusicLibraryDTO.toCategoryRef(piece.level),
      instrumentCount,
      isSaved,
      createdAt: piece.createdAt.toISOString()
    };
  }

  static toLibrarySheetCard(sheetMusic: MusicLibrary.SheetMusicRecord, isSaved: boolean) {
    return {
      id: sheetMusic.id,
      name: sheetMusic.name,
      description: sheetMusic.description,
      kind: sheetMusic.kind,
      isMain: sheetMusic.kind === 'MAIN',
      level: MusicLibraryDTO.toCategoryRef(sheetMusic.level),
      durationSec: sheetMusic.durationSec,
      hasReferenceAudio: Boolean(sheetMusic.referenceAudio),
      hasTutorialVideo: Boolean(sheetMusic.tutorialVideo),
      isSaved
    };
  }

  static async toPlayableMedia(mediaFile: MusicLibrary.MediaFileRecord | null | undefined, isFallback: boolean = false) {
    if (!mediaFile) return null;
    return { url: await MusicLibraryDTO.toReadUrl(mediaFile), durationSec: mediaFile.durationSec, mimeType: mediaFile.mimeType, isFallback };
  }

  static async toSavedPiece(savedItem: MusicLibrary.SavedItemRecord) {
    const piece = savedItem.piece!;
    return {
      savedAt: savedItem.savedAt.toISOString(),
      piece: {
        id: piece.id,
        title: piece.title,
        composer: piece.composer,
        coverUrl: await MusicLibraryDTO.toCoverUrl(piece.coverFile),
        genre: MusicLibraryDTO.toCategoryRef(piece.genre),
        level: MusicLibraryDTO.toCategoryRef(piece.level)
      }
    };
  }

  static async toSavedSheetMusic(savedItem: MusicLibrary.SavedItemRecord) {
    const sheetMusic = savedItem.sheetMusic!;
    return {
      savedAt: savedItem.savedAt.toISOString(),
      sheetMusic: {
        id: sheetMusic.id,
        name: sheetMusic.name,
        kind: sheetMusic.kind,
        isMain: sheetMusic.kind === 'MAIN',
        durationSec: sheetMusic.durationSec,
        instrument: MusicLibraryDTO.toCategoryRef(sheetMusic.instrument),
        level: MusicLibraryDTO.toCategoryRef(sheetMusic.level)
      },
      piece: {
        id: sheetMusic.piece.id,
        title: sheetMusic.piece.title,
        coverUrl: await MusicLibraryDTO.toCoverUrl(sheetMusic.piece.coverFile)
      }
    };
  }

  static toPaginated<TItem>(items: TItem[], total: number, pagination: MusicLibrary.Pagination): Backend.PaginatedResult<TItem> {
    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    };
  }
}
