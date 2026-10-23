import type { Prisma } from '@prisma/client';

export default class MusicLibraryModel {
  static readonly categoryRefSelect = { id: true, name: true, status: true, displayOrder: true } satisfies Prisma.CategorySelect;

  static readonly instrumentRefSelect = {
    id: true,
    code: true,
    name: true,
    isActive: true,
    fminHz: true,
    fmaxHz: true,
    toleranceCents: true
  } satisfies Prisma.InstrumentSelect;

  static readonly mediaFileSelect = {
    id: true,
    kind: true,
    status: true,
    storageKey: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    durationSec: true,
    pageCount: true,
    uploadedById: true,
    createdAt: true
  } satisfies Prisma.MediaFileSelect;

  static readonly pieceSelect = {
    id: true,
    ownerId: true,
    title: true,
    composer: true,
    description: true,
    visibility: true,
    moderation: true,
    moderationReason: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    coverFile: { select: MusicLibraryModel.mediaFileSelect },
    genre: { select: MusicLibraryModel.categoryRefSelect },
    level: { select: MusicLibraryModel.categoryRefSelect },
    // The piece's instruments are derived from its sheet music, in the order they were first added
    sheetMusic: {
      select: {
        id: true,
        instrumentId: true,
        visibility: true,
        moderation: true,
        instrument: { select: MusicLibraryModel.instrumentRefSelect }
      },
      orderBy: { createdAt: 'asc' }
    }
  } satisfies Prisma.PieceSelect;

  static readonly sheetMusicSelect = {
    id: true,
    pieceId: true,
    instrumentId: true,
    kind: true,
    name: true,
    description: true,
    durationSec: true,
    visibility: true,
    moderation: true,
    analysisStatus: true,
    analysisFileUrl: true,
    analysisError: true,
    analysisJobId: true,
    timeSignatureMissing: true,
    uploaderId: true,
    createdAt: true,
    updatedAt: true,
    instrument: { select: MusicLibraryModel.instrumentRefSelect },
    level: { select: MusicLibraryModel.categoryRefSelect },
    sheetFile: { select: MusicLibraryModel.mediaFileSelect },
    referenceAudio: { select: MusicLibraryModel.mediaFileSelect },
    tutorialVideo: { select: MusicLibraryModel.mediaFileSelect }
  } satisfies Prisma.SheetMusicSelect;

  static readonly sheetMusicWithPieceSelect = {
    ...MusicLibraryModel.sheetMusicSelect,
    piece: {
      select: {
        id: true,
        ownerId: true,
        title: true,
        visibility: true,
        moderation: true,
        deletedAt: true,
        coverFile: { select: MusicLibraryModel.mediaFileSelect }
      }
    }
  } satisfies Prisma.SheetMusicSelect;

  static readonly libraryPieceSelect = {
    id: true,
    title: true,
    composer: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    coverFile: { select: MusicLibraryModel.mediaFileSelect },
    genre: { select: MusicLibraryModel.categoryRefSelect },
    level: { select: MusicLibraryModel.categoryRefSelect }
  } satisfies Prisma.PieceSelect;

  static readonly savedItemSelect = {
    id: true,
    targetType: true,
    savedAt: true,
    piece: { select: MusicLibraryModel.libraryPieceSelect },
    sheetMusic: {
      select: {
        id: true,
        name: true,
        kind: true,
        durationSec: true,
        instrument: { select: MusicLibraryModel.instrumentRefSelect },
        level: { select: MusicLibraryModel.categoryRefSelect },
        piece: { select: { id: true, title: true, coverFile: { select: MusicLibraryModel.mediaFileSelect } } }
      }
    }
  } satisfies Prisma.SavedItemSelect;

  // R-04 / GBR-42: what students and guests are allowed to see
  static readonly visiblePieceWhere = {
    visibility: 'PUBLIC',
    moderation: 'NORMAL',
    deletedAt: null
  } satisfies Prisma.PieceWhereInput;

  static readonly visibleSheetMusicWhere = {
    visibility: 'PUBLIC',
    moderation: 'NORMAL',
    piece: MusicLibraryModel.visiblePieceWhere
  } satisfies Prisma.SheetMusicWhereInput;
}
