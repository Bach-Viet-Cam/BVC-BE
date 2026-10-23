import type { Prisma } from '@prisma/client';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import MusicLibraryDTO from '../dto/MusicLibraryDTO.ts';
import CatalogRepository from '../repository/CatalogRepository.ts';
import PieceRepository from '../repository/PieceRepository.ts';
import SheetMusicRepository from '../repository/SheetMusicRepository.ts';
import AnalysisService from './AnalysisService.ts';
import CatalogService from './CatalogService.ts';
import PieceService from './PieceService.ts';
import UploadService from './UploadService.ts';

const MESSAGES = MusicLibraryConstant.messages;
const LABELS = MusicLibraryConstant.fieldLabels;

type LecturerSheetMusicDTO = Awaited<ReturnType<typeof MusicLibraryDTO.toLecturerSheetMusic>>;
interface SheetMusicState { pieceId: string; instrumentId: string; kind: MusicLibrary.SheetKind; name: string; }

export default class SheetMusicService {
  static async getActiveSheetMusic(sheetMusicId: string): Promise<MusicLibrary.SheetMusicWithPieceRecord> {
    const sheetMusic = await SheetMusicRepository.findById(sheetMusicId);
    if (!sheetMusic || sheetMusic.piece.deletedAt) throw AppError.withMessage(404, 'MSG-08', MESSAGES.SHEET_NOT_FOUND);
    return sheetMusic;
  }

  // Any lecturer can add sheet music to any piece; the uploader and the piece owner manage it afterwards
  static canManage(lecturerId: string, sheetMusic: { uploaderId: string }, pieceOwnerId: string): boolean {
    return sheetMusic.uploaderId === lecturerId || pieceOwnerId === lecturerId;
  }

  static async getManageableSheetMusic(lecturerId: string, sheetMusicId: string): Promise<MusicLibrary.SheetMusicWithPieceRecord> {
    const sheetMusic = await SheetMusicService.getActiveSheetMusic(sheetMusicId);
    if (!SheetMusicService.canManage(lecturerId, sheetMusic, sheetMusic.piece.ownerId)) throw AppError.forbidden();
    return sheetMusic;
  }

  // Main sheet first, then level sheets from "Cơ bản" to "Nâng cao"
  static sortSheetMusic<TSheet extends MusicLibrary.SheetMusicRecord>(sheetMusicList: TSheet[]): TSheet[] {
    return [...sheetMusicList].sort((first, second) => (
      Number(second.kind === 'MAIN') - Number(first.kind === 'MAIN')
      || first.level.displayOrder - second.level.displayOrder
      || first.createdAt.getTime() - second.createdAt.getTime()
    ));
  }

  static async listForPiece(lecturerId: string, pieceId: string) {
    const piece = await PieceService.getActivePiece(pieceId);
    const sheetMusicList = SheetMusicService.sortSheetMusic(await SheetMusicRepository.listByPiece(pieceId));
    // A piece's instruments come from its sheet music; the form may pick any active instrument
    const pieceInstruments = MusicLibraryDTO.uniqueInstruments(sheetMusicList);
    const groups = await Promise.all(pieceInstruments
      .map((instrument) => ({ instrument, items: sheetMusicList.filter((sheetMusic) => sheetMusic.instrumentId === instrument.id) }))
      .map(async (group) => ({
        instrument: MusicLibraryDTO.toCategoryRef(group.instrument),
        count: group.items.length,
        items: await Promise.all(group.items.map((sheetMusic) => MusicLibraryDTO.toLecturerSheetMusic(
          sheetMusic,
          SheetMusicService.canManage(lecturerId, sheetMusic, piece.ownerId)
        )))
      })));
    const activeInstruments = await CatalogRepository.listActiveInstruments();
    const optionInstruments = [
      ...pieceInstruments,
      ...activeInstruments.filter((instrument) => !pieceInstruments.some(({ id }) => id === instrument.id))
    ];
    // GBR-55: the form defaults to "Bản chính" until the instrument has one
    const instrumentOptions = optionInstruments.map((instrument) => {
      const hasMain = sheetMusicList.some((sheetMusic) => sheetMusic.instrumentId === instrument.id && sheetMusic.kind === 'MAIN');
      return { ...MusicLibraryDTO.toCategoryRef(instrument), hasMain, defaultKind: hasMain ? 'LEVEL' : 'MAIN' };
    });
    return {
      piece: { id: piece.id, title: piece.title, coverUrl: await MusicLibraryDTO.toCoverUrl(piece.coverFile) },
      total: sheetMusicList.length,
      groups,
      instrumentOptions
    };
  }

  static async getSheetMusic(lecturerId: string, sheetMusicId: string): Promise<LecturerSheetMusicDTO> {
    const sheetMusic = await SheetMusicService.getActiveSheetMusic(sheetMusicId);
    return MusicLibraryDTO.toLecturerSheetMusic(sheetMusic, SheetMusicService.canManage(lecturerId, sheetMusic, sheetMusic.piece.ownerId));
  }

  static async assertUniqueName(pieceId: string, name: string, excludedSheetMusicId?: string): Promise<void> {
    if (await SheetMusicRepository.findByName(pieceId, name, excludedSheetMusicId)) {
      throw AppError.withMessage(409, 'MSG-05', { field: LABELS.name }, 'name');
    }
  }

  // GBR-55: at most one main sheet per (piece, instrument)
  static async assertMainAvailable(pieceId: string, instrumentId: string, excludedSheetMusicId?: string): Promise<void> {
    const existingMain = await SheetMusicRepository.findMain(pieceId, instrumentId);
    if (existingMain && existingMain.id !== excludedSheetMusicId) {
      throw AppError.withMessage(409, 'MSG-08', MESSAGES.MAIN_ALREADY_EXISTS, 'kind');
    }
  }

  // GBR-43: a main sheet without reference audio can be saved but not published
  static assertPublishable(kind: MusicLibrary.SheetKind, visibility: MusicLibrary.Visibility, hasReferenceAudio: boolean): void {
    if (visibility === 'PUBLIC' && kind === 'MAIN' && !hasReferenceAudio) {
      throw AppError.withMessage(409, 'MSG-08', MESSAGES.MAIN_NEEDS_AUDIO, 'visibility');
    }
  }

  // Unique-index race (two requests at once): re-check to return the right message
  static async mapUniqueViolation(error: unknown, sheetMusicState: SheetMusicState, excludedSheetMusicId?: string): Promise<never> {
    if ((error as { code?: string }).code === 'P2002') {
      await SheetMusicService.assertUniqueName(sheetMusicState.pieceId, sheetMusicState.name, excludedSheetMusicId);
      if (sheetMusicState.kind === 'MAIN') {
        await SheetMusicService.assertMainAvailable(sheetMusicState.pieceId, sheetMusicState.instrumentId, excludedSheetMusicId);
      }
    }
    throw error;
  }

  static async createSheetMusic(
    lecturerId: string,
    pieceId: string,
    sheetMusicInput: MusicLibrary.SheetMusicCreateInput
  ): Promise<LecturerSheetMusicDTO> {
    await PieceService.getActivePiece(pieceId);
    await CatalogService.assertInstrument(sheetMusicInput.instrumentId);
    await CatalogService.assertCategory('LEVEL', sheetMusicInput.levelId, 'levelId');
    const existingMain = await SheetMusicRepository.findMain(pieceId, sheetMusicInput.instrumentId);
    const kind = sheetMusicInput.kind ?? (existingMain ? 'LEVEL' : 'MAIN');
    if (kind === 'MAIN' && existingMain) throw AppError.withMessage(409, 'MSG-08', MESSAGES.MAIN_ALREADY_EXISTS, 'kind');
    await SheetMusicService.assertUniqueName(pieceId, sheetMusicInput.name);

    const hasReferenceAudio = Boolean(sheetMusicInput.referenceAudioId);
    const visibility = sheetMusicInput.visibility ?? (kind === 'MAIN' && !hasReferenceAudio ? 'HIDDEN' : 'PUBLIC');
    SheetMusicService.assertPublishable(kind, visibility, hasReferenceAudio);

    const sheetFile = await UploadService.requireAttachableFile(sheetMusicInput.sheetFileId, lecturerId, 'SHEET', 'sheetFileId');
    const referenceAudio = sheetMusicInput.referenceAudioId
      ? await UploadService.requireAttachableFile(sheetMusicInput.referenceAudioId, lecturerId, 'AUDIO', 'referenceAudioId')
      : null;
    const tutorialVideo = sheetMusicInput.tutorialVideoId
      ? await UploadService.requireAttachableFile(sheetMusicInput.tutorialVideoId, lecturerId, 'VIDEO', 'tutorialVideoId')
      : null;

    const sheetMusicState = { pieceId, instrumentId: sheetMusicInput.instrumentId, kind, name: sheetMusicInput.name };
    const createdSheetMusic = await SheetMusicRepository.create({
      pieceId,
      instrumentId: sheetMusicInput.instrumentId,
      kind,
      mainInstrumentId: kind === 'MAIN' ? sheetMusicInput.instrumentId : null,
      name: sheetMusicInput.name,
      levelId: sheetMusicInput.levelId,
      description: sheetMusicInput.description ?? null,
      sheetFileId: sheetFile.id,
      referenceAudioId: referenceAudio?.id ?? null,
      tutorialVideoId: tutorialVideo?.id ?? null,
      durationSec: referenceAudio?.durationSec ?? null,
      visibility,
      uploaderId: lecturerId
    }).catch((error: unknown) => SheetMusicService.mapUniqueViolation(error, sheetMusicState));
    await PieceRepository.touch(pieceId);
    await AnalysisService.requestAnalysis(createdSheetMusic);
    return SheetMusicService.getSheetMusic(lecturerId, createdSheetMusic.id);
  }

  static assertVisibilityChangeAllowed(sheetMusic: MusicLibrary.SheetMusicRecord, requestedVisibility: MusicLibrary.Visibility | undefined): void {
    if (requestedVisibility === undefined || requestedVisibility === sheetMusic.visibility) return;
    if (sheetMusic.moderation === 'ADMIN_HIDDEN') throw AppError.withMessage(409, 'MSG-08', MESSAGES.SHEET_ADMIN_HIDDEN, 'visibility');
  }

  static async updateSheetMusic(
    lecturerId: string,
    sheetMusicId: string,
    sheetMusicInput: MusicLibrary.SheetMusicUpdateInput
  ): Promise<LecturerSheetMusicDTO> {
    const sheetMusic = await SheetMusicService.getManageableSheetMusic(lecturerId, sheetMusicId);
    SheetMusicService.assertVisibilityChangeAllowed(sheetMusic, sheetMusicInput.visibility);
    const nextState: SheetMusicState = {
      pieceId: sheetMusic.pieceId,
      instrumentId: sheetMusicInput.instrumentId ?? sheetMusic.instrumentId,
      kind: sheetMusicInput.kind ?? sheetMusic.kind,
      name: sheetMusicInput.name ?? sheetMusic.name
    };
    await SheetMusicService.assertUpdateRules(sheetMusic, sheetMusicInput, nextState);

    const updatedSheetMusic = await SheetMusicRepository.update(sheetMusicId, {
      instrumentId: nextState.instrumentId,
      kind: nextState.kind,
      mainInstrumentId: nextState.kind === 'MAIN' ? nextState.instrumentId : null,
      name: nextState.name,
      ...(sheetMusicInput.levelId ? { levelId: sheetMusicInput.levelId } : {}),
      ...(sheetMusicInput.description !== undefined ? { description: sheetMusicInput.description } : {}),
      ...(sheetMusicInput.visibility ? { visibility: sheetMusicInput.visibility } : {})
    }).catch((error: unknown) => SheetMusicService.mapUniqueViolation(error, nextState, sheetMusicId));
    await PieceRepository.touch(sheetMusic.pieceId);
    await SheetMusicService.syncAnalysisAfterUpdate(sheetMusic, updatedSheetMusic);
    return SheetMusicService.getSheetMusic(lecturerId, sheetMusicId);
  }

  static async assertUpdateRules(
    sheetMusic: MusicLibrary.SheetMusicWithPieceRecord,
    sheetMusicInput: MusicLibrary.SheetMusicUpdateInput,
    nextState: SheetMusicState
  ): Promise<void> {
    if (nextState.instrumentId !== sheetMusic.instrumentId) await CatalogService.assertInstrument(nextState.instrumentId);
    if (sheetMusicInput.levelId) await CatalogService.assertCategory('LEVEL', sheetMusicInput.levelId, 'levelId', sheetMusic.level.id);
    if (nextState.name !== sheetMusic.name) await SheetMusicService.assertUniqueName(sheetMusic.pieceId, nextState.name, sheetMusic.id);
    if (nextState.kind === 'MAIN') await SheetMusicService.assertMainAvailable(sheetMusic.pieceId, nextState.instrumentId, sheetMusic.id);
    SheetMusicService.assertPublishable(nextState.kind, sheetMusicInput.visibility ?? sheetMusic.visibility, Boolean(sheetMusic.referenceAudio));
  }

  static async syncAnalysisAfterUpdate(previous: MusicLibrary.SheetMusicRecord, updated: MusicLibrary.SheetMusicRecord): Promise<void> {
    if (previous.kind === 'MAIN' && updated.kind !== 'MAIN') {
      await AnalysisService.clearAnalysis(updated.id);
      return;
    }
    const isNewMain = updated.kind === 'MAIN' && (previous.kind !== 'MAIN' || previous.instrumentId !== updated.instrumentId);
    if (isNewMain) await AnalysisService.requestAnalysis({ ...updated, analysisFileUrl: null });
  }

  // GBR-43: the sheet_music id never changes, so assignments and saved items keep working
  static async replaceFile(
    lecturerId: string,
    sheetMusicId: string,
    slot: MusicLibrary.SheetSlot,
    mediaFileId: string
  ): Promise<LecturerSheetMusicDTO> {
    const sheetMusic = await SheetMusicService.getManageableSheetMusic(lecturerId, sheetMusicId);
    const mediaKind = MusicLibraryConstant.sheetSlots[slot];
    const nextFile = await UploadService.requireAttachableFile(mediaFileId, lecturerId, mediaKind, 'fileId');
    const slotUpdates: Record<MusicLibrary.SheetSlot, Prisma.SheetMusicUncheckedUpdateInput> = {
      sheet: { sheetFileId: nextFile.id },
      audio: { referenceAudioId: nextFile.id, durationSec: nextFile.durationSec },
      video: { tutorialVideoId: nextFile.id }
    };
    const previousFiles: Record<MusicLibrary.SheetSlot, MusicLibrary.MediaFileRecord | null> = {
      sheet: sheetMusic.sheetFile,
      audio: sheetMusic.referenceAudio,
      video: sheetMusic.tutorialVideo
    };
    const updatedSheetMusic = await SheetMusicRepository.update(sheetMusicId, slotUpdates[slot]);
    await UploadService.discardFile(previousFiles[slot]);
    await PieceRepository.touch(sheetMusic.pieceId);
    if (slot === 'audio') await AnalysisService.requestAnalysis(updatedSheetMusic);
    return SheetMusicService.getSheetMusic(lecturerId, sheetMusicId);
  }

  static async setVisibility(lecturerId: string, sheetMusicId: string, visibility: MusicLibrary.Visibility): Promise<LecturerSheetMusicDTO> {
    const sheetMusic = await SheetMusicService.getManageableSheetMusic(lecturerId, sheetMusicId);
    if (sheetMusic.moderation === 'ADMIN_HIDDEN') throw AppError.withMessage(409, 'MSG-08', MESSAGES.SHEET_ADMIN_HIDDEN, 'visibility');
    SheetMusicService.assertPublishable(sheetMusic.kind, visibility, Boolean(sheetMusic.referenceAudio));
    await SheetMusicRepository.update(sheetMusicId, { visibility });
    await PieceRepository.touch(sheetMusic.pieceId);
    return SheetMusicService.getSheetMusic(lecturerId, sheetMusicId);
  }
}
