import MessageConstant from '../../../constants/MessageConstant.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import MusicLibraryDTO from '../dto/MusicLibraryDTO.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import CatalogService from './CatalogService.ts';
import UploadService from './UploadService.ts';

const MESSAGES = MusicLibraryConstant.messages;

type LecturerPieceDTO = Awaited<ReturnType<typeof MusicLibraryDTO.toLecturerPiece>>;
interface PieceMutationResult { piece: LecturerPieceDTO; warning: MusicLibrary.WarningDTO | null; }

export default class PieceService {
  // R-01: lecturers only see and edit their own pieces
  static async getOwnedPiece(lecturerId: string, pieceId: string): Promise<MusicLibrary.PieceRecord> {
    const piece = await PieceRepository.findById(pieceId);
    if (!piece) throw AppError.withMessage(404, 'MSG-08', MESSAGES.PIECE_NOT_FOUND);
    if (piece.ownerId !== lecturerId) throw AppError.forbidden();
    return piece;
  }

  static async listPieces(lecturerId: string, query: MusicLibrary.LecturerPieceQuery) {
    const [pieces, total] = await PieceRepository.listForOwner(lecturerId, query);
    const pieceDTOs = await Promise.all(pieces.map(MusicLibraryDTO.toLecturerPiece));
    return MusicLibraryDTO.toPaginated(pieceDTOs, total, query);
  }

  static async getPiece(lecturerId: string, pieceId: string): Promise<LecturerPieceDTO> {
    return MusicLibraryDTO.toLecturerPiece(await PieceService.getOwnedPiece(lecturerId, pieceId));
  }

  // R-03 / MSG-46: publishing a piece without any public sheet is allowed but warned about
  static async buildPublicWarning(piece: MusicLibrary.PieceRecord): Promise<MusicLibrary.WarningDTO | null> {
    if (piece.visibility !== 'PUBLIC' || piece.moderation !== 'NORMAL') return null;
    if (await SheetMusicRepository.countVisibleByPiece(piece.id) > 0) return null;
    return { code: 'MSG-46', message: MessageConstant.format('MSG-46') };
  }

  static async toMutationResult(piece: MusicLibrary.PieceRecord): Promise<PieceMutationResult> {
    return { piece: await MusicLibraryDTO.toLecturerPiece(piece), warning: await PieceService.buildPublicWarning(piece) };
  }

  static async createPiece(lecturerId: string, pieceInput: MusicLibrary.PieceInput): Promise<PieceMutationResult> {
    await CatalogService.assertCategory('GENRE', pieceInput.genreId, 'genreId');
    await CatalogService.assertCategory('LEVEL', pieceInput.levelId, 'levelId');
    const coverFile = pieceInput.coverFileId
      ? await UploadService.requireAttachableFile(pieceInput.coverFileId, lecturerId, 'COVER', 'coverFileId')
      : null;
    const piece = await PieceRepository.create(lecturerId, {
      title: pieceInput.title,
      composer: pieceInput.composer ?? null,
      description: pieceInput.description ?? null,
      genreId: pieceInput.genreId,
      levelId: pieceInput.levelId,
      visibility: pieceInput.visibility ?? 'HIDDEN',
      coverFileId: coverFile?.id ?? null
    });
    return PieceService.toMutationResult(piece);
  }

  // GBR-45: admin-hidden content cannot be re-published by its lecturer
  static assertVisibilityChangeAllowed(piece: MusicLibrary.PieceRecord, requestedVisibility: MusicLibrary.Visibility | undefined): void {
    if (requestedVisibility === undefined || requestedVisibility === piece.visibility) return;
    if (piece.moderation === 'ADMIN_HIDDEN') throw AppError.withMessage(409, 'MSG-08', MESSAGES.PIECE_ADMIN_HIDDEN, 'visibility');
  }

  static async updatePiece(lecturerId: string, pieceId: string, pieceInput: MusicLibrary.PieceInput): Promise<PieceMutationResult> {
    const piece = await PieceService.getOwnedPiece(lecturerId, pieceId);
    PieceService.assertVisibilityChangeAllowed(piece, pieceInput.visibility);
    await CatalogService.assertCategory('GENRE', pieceInput.genreId, 'genreId', piece.genre.id);
    await CatalogService.assertCategory('LEVEL', pieceInput.levelId, 'levelId', piece.level.id);

    const isCoverChanged = pieceInput.coverFileId !== undefined && pieceInput.coverFileId !== (piece.coverFile?.id ?? null);
    const nextCoverFile = isCoverChanged && pieceInput.coverFileId
      ? await UploadService.requireAttachableFile(pieceInput.coverFileId, lecturerId, 'COVER', 'coverFileId')
      : null;
    const updatedPiece = await PieceRepository.update(pieceId, {
      title: pieceInput.title,
      composer: pieceInput.composer ?? null,
      description: pieceInput.description ?? null,
      genreId: pieceInput.genreId,
      levelId: pieceInput.levelId,
      ...(pieceInput.visibility ? { visibility: pieceInput.visibility } : {}),
      ...(isCoverChanged ? { coverFileId: nextCoverFile?.id ?? null } : {})
    });
    if (isCoverChanged) await UploadService.discardFile(piece.coverFile);
    return PieceService.toMutationResult(updatedPiece);
  }

  static async setVisibility(lecturerId: string, pieceId: string, visibility: MusicLibrary.Visibility): Promise<PieceMutationResult> {
    const piece = await PieceService.getOwnedPiece(lecturerId, pieceId);
    if (piece.moderation === 'ADMIN_HIDDEN') throw AppError.withMessage(409, 'MSG-08', MESSAGES.PIECE_ADMIN_HIDDEN, 'visibility');
    const updatedPiece = await PieceRepository.updateFields(pieceId, { visibility });
    return PieceService.toMutationResult(updatedPiece);
  }

  static async replaceCover(lecturerId: string, pieceId: string, coverFileId: string): Promise<LecturerPieceDTO> {
    const piece = await PieceService.getOwnedPiece(lecturerId, pieceId);
    const coverFile = await UploadService.requireAttachableFile(coverFileId, lecturerId, 'COVER', 'fileId');
    const updatedPiece = await PieceRepository.updateFields(pieceId, { coverFileId: coverFile.id });
    await UploadService.discardFile(piece.coverFile);
    return MusicLibraryDTO.toLecturerPiece(updatedPiece);
  }

  static async removeCover(lecturerId: string, pieceId: string): Promise<LecturerPieceDTO> {
    const piece = await PieceService.getOwnedPiece(lecturerId, pieceId);
    if (!piece.coverFile) return MusicLibraryDTO.toLecturerPiece(piece);
    const updatedPiece = await PieceRepository.updateFields(pieceId, { coverFileId: null });
    await UploadService.discardFile(piece.coverFile);
    return MusicLibraryDTO.toLecturerPiece(updatedPiece);
  }
}
