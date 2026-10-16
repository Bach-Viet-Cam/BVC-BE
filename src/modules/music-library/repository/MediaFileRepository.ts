import type { MediaKind } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import MusicLibraryModel from '../model/MusicLibraryModel.ts';

interface MediaFileCreateData {
  kind: MediaKind;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
}

export default class MediaFileRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async create(mediaFileData: MediaFileCreateData): Promise<MusicLibrary.MediaFileRecord> {
    return MediaFileRepository.client.mediaFile.create({ data: mediaFileData, select: MusicLibraryModel.mediaFileSelect });
  }

  static async findById(mediaFileId: string): Promise<MusicLibrary.MediaFileRecord | null> {
    return MediaFileRepository.client.mediaFile.findUnique({ where: { id: mediaFileId }, select: MusicLibraryModel.mediaFileSelect });
  }

  static async markReady(mediaFileId: string, inspectedFile: MusicLibrary.InspectedFile): Promise<MusicLibrary.MediaFileRecord> {
    return MediaFileRepository.client.mediaFile.update({
      where: { id: mediaFileId },
      data: { status: 'READY', ...inspectedFile },
      select: MusicLibraryModel.mediaFileSelect
    });
  }

  static async countUsages(mediaFileId: string): Promise<number> {
    const usageCounts = await MediaFileRepository.client.mediaFile.findUnique({
      where: { id: mediaFileId },
      select: { _count: { select: { coverOfPieces: true, sheetOf: true, referenceAudioOf: true, tutorialVideoOf: true } } }
    });
    if (!usageCounts) return 0;
    return Object.values(usageCounts._count).reduce((total, count) => total + count, 0);
  }

  static async deleteById(mediaFileId: string): Promise<void> {
    await MediaFileRepository.client.mediaFile.deleteMany({ where: { id: mediaFileId } });
  }
}
