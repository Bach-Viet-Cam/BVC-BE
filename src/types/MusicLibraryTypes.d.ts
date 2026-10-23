declare namespace MusicLibrary {
  type Prisma = import('@prisma/client').Prisma;
  type Model = typeof import('../modules/music-library/model/MusicLibraryModel.ts').default;
  type DbClient = import('@prisma/client').Prisma.TransactionClient;

  type MediaKind = import('@prisma/client').MediaKind;
  type Visibility = import('@prisma/client').Visibility;
  type SheetKind = import('@prisma/client').SheetKind;
  type SavedTargetType = import('@prisma/client').SavedTargetType;
  type SheetSlot = 'sheet' | 'audio' | 'video';
  type LecturerVisibilityFilter = 'ALL' | 'PUBLIC' | 'HIDDEN' | 'ADMIN_HIDDEN';
  type LibrarySort = 'newest' | 'title_asc' | 'title_desc';

  type CategoryRecord = import('@prisma/client').Prisma.CategoryGetPayload<{ select: Model['categoryRefSelect'] }>;
  type InstrumentRecord = import('@prisma/client').Prisma.InstrumentGetPayload<{ select: Model['instrumentRefSelect'] }>;
  type MediaFileRecord = import('@prisma/client').Prisma.MediaFileGetPayload<{ select: Model['mediaFileSelect'] }>;
  type PieceRecord = import('@prisma/client').Prisma.PieceGetPayload<{ select: Model['pieceSelect'] }>;
  type SheetMusicRecord = import('@prisma/client').Prisma.SheetMusicGetPayload<{ select: Model['sheetMusicSelect'] }>;
  type SheetMusicWithPieceRecord = import('@prisma/client').Prisma.SheetMusicGetPayload<{ select: Model['sheetMusicWithPieceSelect'] }>;
  type LibraryPieceRecord = import('@prisma/client').Prisma.PieceGetPayload<{ select: Model['libraryPieceSelect'] }>;
  type SavedItemRecord = import('@prisma/client').Prisma.SavedItemGetPayload<{ select: Model['savedItemSelect'] }>;

  interface Pagination { page: number; pageSize: number; }

  // ----- Requests -----
  interface PresignRequest { kind: MediaKind; fileName: string; mimeType: string; size: number; }
  interface PieceInput {
    title: string;
    composer?: string | null;
    description?: string | null;
    genreId: string;
    levelId: string;
    visibility?: Visibility;
    coverFileId?: string | null;
  }
  interface SheetMusicCreateInput {
    instrumentId: string;
    kind?: SheetKind;
    name: string;
    levelId: string;
    description?: string | null;
    sheetFileId: string;
    referenceAudioId?: string | null;
    tutorialVideoId?: string | null;
    visibility?: Visibility;
  }
  interface SheetMusicUpdateInput {
    instrumentId?: string;
    kind?: SheetKind;
    name?: string;
    levelId?: string;
    description?: string | null;
    visibility?: Visibility;
  }
  interface LecturerPieceQuery extends Pagination {
    q?: string;
    genreId?: string;
    instrumentId?: string;
    levelId?: string;
    visibility: LecturerVisibilityFilter;
  }
  interface LibraryPieceQuery extends Pagination {
    q?: string;
    genreIds: string[];
    instrumentIds: string[];
    levelIds: string[];
    sort: LibrarySort;
  }
  interface SavedQuery extends Pagination { type: SavedTargetType; }
  interface AnalysisCallbackInput {
    jobId?: string;
    status: 'READY' | 'ERROR';
    analysisFileUrl?: string;
    reason?: string;
    timeSignatureMissing?: boolean;
  }

  interface FileRules { extensions: string[]; formatLabel: string; maxBytes: number; maxMb: number; }
  interface InspectedFile { sizeBytes: number; durationSec: number | null; pageCount: number | null; }

  // ----- Responses -----
  interface CategoryRefDTO { id: string; name: string; }
  interface MediaFileDTO {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    durationSec: number | null;
    pageCount: number | null;
    url: string | null;
  }
  interface WarningDTO { code: Backend.MessageCode; message: string; }
}
