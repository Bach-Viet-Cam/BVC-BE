import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import TextNormalizer from '../../../utils/TextNormalizer.ts';
import MusicLibraryModel from '../model/MusicLibraryModel.ts';

interface PieceWriteData {
  title: string;
  composer: string | null;
  description: string | null;
  genreId: string;
  visibility?: MusicLibrary.Visibility;
  coverFileId?: string | null;
}

export default class PieceRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static toSearchColumns(pieceData: PieceWriteData) {
    return {
      titleNormalized: TextNormalizer.normalize(pieceData.title),
      composerNormalized: TextNormalizer.normalize(pieceData.composer),
      searchText: TextNormalizer.normalize([pieceData.title, pieceData.composer, pieceData.description].filter(Boolean).join(' '))
    };
  }

  static buildKeywordFilters(keyword: string | undefined, columns: ('titleNormalized' | 'composerNormalized' | 'searchText')[]): Prisma.PieceWhereInput[] {
    // Every token must match one of the columns: "ngua ly" still finds "Lý ngựa ô"
    return TextNormalizer.toSearchTokens(keyword).map((token) => ({
      OR: columns.map((column) => ({ [column]: { contains: token } }))
    }));
  }

  static async create(ownerId: string, pieceData: PieceWriteData): Promise<MusicLibrary.PieceRecord> {
    return PieceRepository.client.piece.create({
      data: {
        ...pieceData,
        ...PieceRepository.toSearchColumns(pieceData),
        ownerId
      },
      select: MusicLibraryModel.pieceSelect
    });
  }

  static async update(pieceId: string, pieceData: PieceWriteData): Promise<MusicLibrary.PieceRecord> {
    return PieceRepository.client.piece.update({
      where: { id: pieceId },
      data: { ...pieceData, ...PieceRepository.toSearchColumns(pieceData) },
      select: MusicLibraryModel.pieceSelect
    });
  }

  static async updateFields(pieceId: string, pieceData: Prisma.PieceUncheckedUpdateInput): Promise<MusicLibrary.PieceRecord> {
    return PieceRepository.client.piece.update({ where: { id: pieceId }, data: pieceData, select: MusicLibraryModel.pieceSelect });
  }

  static async touch(pieceId: string, database: MusicLibrary.DbClient = PieceRepository.client): Promise<void> {
    await database.piece.update({ where: { id: pieceId }, data: { updatedAt: new Date() } });
  }

  static async findById(pieceId: string): Promise<MusicLibrary.PieceRecord | null> {
    return PieceRepository.client.piece.findFirst({ where: { id: pieceId, deletedAt: null }, select: MusicLibraryModel.pieceSelect });
  }

  static buildLecturerWhere(lecturerId: string, query: MusicLibrary.LecturerPieceQuery): Prisma.PieceWhereInput {
    const visibilityFilters: Record<MusicLibrary.LecturerVisibilityFilter, Prisma.PieceWhereInput> = {
      ALL: {},
      PUBLIC: { visibility: 'PUBLIC', moderation: 'NORMAL' },
      HIDDEN: { visibility: 'HIDDEN', moderation: 'NORMAL' },
      ADMIN_HIDDEN: { moderation: 'ADMIN_HIDDEN' }
    };
    const contributedWhere: Prisma.PieceWhereInput = { sheetMusic: { some: { uploaderId: lecturerId } } };
    const ownershipFilters: Record<MusicLibrary.LecturerOwnershipFilter, Prisma.PieceWhereInput> = {
      ALL: { OR: [{ ownerId: lecturerId }, contributedWhere] },
      OWNED: { ownerId: lecturerId },
      CONTRIBUTED: { ownerId: { not: lecturerId }, ...contributedWhere }
    };
    // Instrument and level both belong to sheet music: one sheet must match both
    const sheetFilter: Prisma.SheetMusicWhereInput = {
      ...(query.instrumentId ? { instrumentId: query.instrumentId } : {}),
      ...(query.levelId ? { levelId: query.levelId } : {})
    };
    return {
      deletedAt: null,
      ...visibilityFilters[query.visibility],
      ...(query.genreId ? { genreId: query.genreId } : {}),
      AND: [
        ownershipFilters[query.ownership],
        ...(Object.keys(sheetFilter).length > 0 ? [{ sheetMusic: { some: sheetFilter } }] : []),
        ...PieceRepository.buildKeywordFilters(query.q, ['titleNormalized', 'composerNormalized'])
      ]
    };
  }

  static async listForLecturer(lecturerId: string, query: MusicLibrary.LecturerPieceQuery): Promise<[MusicLibrary.PieceRecord[], number]> {
    const where = PieceRepository.buildLecturerWhere(lecturerId, query);
    return PieceRepository.client.$transaction([
      PieceRepository.client.piece.findMany({
        where,
        select: MusicLibraryModel.pieceSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      PieceRepository.client.piece.count({ where })
    ]);
  }

  static buildLibraryWhere(query: MusicLibrary.LibraryPieceQuery): Prisma.PieceWhereInput {
    // A piece matches when one of its public sheets has the chosen instrument and level
    const hasSheetFilter = query.instrumentIds.length > 0 || query.levelIds.length > 0;
    const sheetFilter: Prisma.SheetMusicWhereInput = {
      visibility: 'PUBLIC',
      moderation: 'NORMAL',
      ...(query.instrumentIds.length > 0 ? { instrumentId: { in: query.instrumentIds } } : {}),
      ...(query.levelIds.length > 0 ? { levelId: { in: query.levelIds } } : {})
    };
    return {
      ...MusicLibraryModel.visiblePieceWhere,
      ...(query.genreIds.length > 0 ? { genreId: { in: query.genreIds } } : {}),
      ...(hasSheetFilter ? { sheetMusic: { some: sheetFilter } } : {}),
      AND: PieceRepository.buildKeywordFilters(query.q, ['searchText'])
    };
  }

  static async listLibrary(query: MusicLibrary.LibraryPieceQuery): Promise<[MusicLibrary.LibraryPieceRecord[], number]> {
    const where = PieceRepository.buildLibraryWhere(query);
    const sortOrders: Record<MusicLibrary.LibrarySort, Prisma.PieceOrderByWithRelationInput[]> = {
      newest: [{ createdAt: 'desc' }, { id: 'asc' }],
      title_asc: [{ titleNormalized: 'asc' }, { title: 'asc' }, { id: 'asc' }],
      title_desc: [{ titleNormalized: 'desc' }, { title: 'desc' }, { id: 'asc' }]
    };
    return PieceRepository.client.$transaction([
      PieceRepository.client.piece.findMany({
        where,
        select: MusicLibraryModel.libraryPieceSelect,
        orderBy: sortOrders[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      PieceRepository.client.piece.count({ where })
    ]);
  }

  static async countLibrary(): Promise<number> {
    return PieceRepository.client.piece.count({ where: MusicLibraryModel.visiblePieceWhere });
  }

  static async findVisibleById(pieceId: string): Promise<MusicLibrary.LibraryPieceRecord | null> {
    return PieceRepository.client.piece.findFirst({
      where: { id: pieceId, ...MusicLibraryModel.visiblePieceWhere },
      select: MusicLibraryModel.libraryPieceSelect
    });
  }

  static async findVisibleByIds(pieceIds: string[]): Promise<MusicLibrary.LibraryPieceRecord[]> {
    if (pieceIds.length === 0) return [];
    return PieceRepository.client.piece.findMany({
      where: { id: { in: pieceIds }, ...MusicLibraryModel.visiblePieceWhere },
      select: MusicLibraryModel.libraryPieceSelect
    });
  }

  // Visible pieces ranked by submissions received since the given instant; id breaks ties
  static async findTrendingCounts(since: Date, limit: number): Promise<MusicLibrary.TrendingCount[]> {
    const groups = await PieceRepository.client.submission.groupBy({
      by: ['pieceId'],
      where: { createdAt: { gte: since }, piece: MusicLibraryModel.visiblePieceWhere },
      _count: { pieceId: true },
      orderBy: [{ _count: { pieceId: 'desc' } }, { pieceId: 'asc' }],
      take: limit
    });
    return groups.map((group) => ({ pieceId: group.pieceId, submissionCount: group._count.pieceId }));
  }

  // R-05: instruments that have at least one visible sheet, per piece
  static async findVisibleInstrumentPairs(pieceIds: string[]): Promise<{ pieceId: string; instrumentId: string }[]> {
    if (pieceIds.length === 0) return [];
    return PieceRepository.client.sheetMusic.findMany({
      where: { pieceId: { in: pieceIds }, ...MusicLibraryModel.visibleSheetMusicWhere },
      select: { pieceId: true, instrumentId: true },
      distinct: ['pieceId', 'instrumentId']
    });
  }
}
