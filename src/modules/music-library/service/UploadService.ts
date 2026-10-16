import crypto from 'node:crypto';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import MusicLibraryDTO from '../dto/MusicLibraryDTO.ts';
import MediaFileRepository from '../repository/MediaFileRepository.ts';
import CatalogService from './CatalogService.ts';
import MediaInspectionService from './MediaInspectionService.ts';

const MESSAGES = MusicLibraryConstant.messages;

// Upload flow: presign → browser PUTs to storage → confirm (or attach, which confirms implicitly)
export default class UploadService {
  static buildStorageKey(kind: MusicLibrary.MediaKind, fileName: string): string {
    const extension = MediaInspectionService.getExtension(fileName);
    const yearMonth = new Date().toISOString().slice(0, 7);
    return `${kind.toLowerCase()}/${yearMonth}/${crypto.randomUUID()}.${extension}`;
  }

  static async createPresignedUpload(uploaderId: string, presignRequest: MusicLibrary.PresignRequest) {
    const fileRules = await CatalogService.getFileRules(presignRequest.kind);
    MediaInspectionService.assertDeclaredFile(presignRequest.fileName, presignRequest.size, fileRules);
    const mediaFile = await MediaFileRepository.create({
      kind: presignRequest.kind,
      storageKey: UploadService.buildStorageKey(presignRequest.kind, presignRequest.fileName),
      originalName: presignRequest.fileName,
      mimeType: presignRequest.mimeType,
      sizeBytes: presignRequest.size,
      uploadedById: uploaderId
    });
    const presignedUpload = await StorageService.driver.createUploadUrl(
      mediaFile.storageKey,
      mediaFile.mimeType,
      MusicLibraryConstant.urlLifetimes.UPLOAD_SEC
    );
    return { fileId: mediaFile.id, ...presignedUpload, maxSizeBytes: fileRules.maxBytes };
  }

  static async findOwnedFile(mediaFileId: string, uploaderId: string): Promise<MusicLibrary.MediaFileRecord> {
    const mediaFile = await MediaFileRepository.findById(mediaFileId);
    if (!mediaFile || mediaFile.uploadedById !== uploaderId) {
      throw AppError.withMessage(400, 'MSG-08', MESSAGES.FILE_NOT_UPLOADED, 'fileId');
    }
    return mediaFile;
  }

  // Invalid files are removed so a rejected upload never lingers in storage
  static async confirmFile(mediaFile: MusicLibrary.MediaFileRecord): Promise<MusicLibrary.MediaFileRecord> {
    if (mediaFile.status === 'READY') return mediaFile;
    try {
      const inspectedFile = await MediaInspectionService.inspect(mediaFile);
      return await MediaFileRepository.markReady(mediaFile.id, inspectedFile);
    } catch (error) {
      await MediaFileRepository.deleteById(mediaFile.id);
      await StorageService.deleteQuietly(mediaFile.storageKey);
      throw error;
    }
  }

  static async confirmUpload(uploaderId: string, mediaFileId: string): Promise<MusicLibrary.MediaFileDTO> {
    const mediaFile = await UploadService.confirmFile(await UploadService.findOwnedFile(mediaFileId, uploaderId));
    return MusicLibraryDTO.toMediaFile(mediaFile);
  }

  // Validates a file before it is linked to a piece or sheet music
  static async requireAttachableFile(
    mediaFileId: string,
    uploaderId: string,
    expectedKind: MusicLibrary.MediaKind,
    field: string
  ): Promise<MusicLibrary.MediaFileRecord> {
    const mediaFile = await UploadService.findOwnedFile(mediaFileId, uploaderId);
    if (mediaFile.kind !== expectedKind) throw AppError.withMessage(400, 'MSG-08', MESSAGES.FILE_KIND_MISMATCH, field);
    if (await MediaFileRepository.countUsages(mediaFile.id) > 0) {
      throw AppError.withMessage(409, 'MSG-08', MESSAGES.FILE_ALREADY_USED, field);
    }
    return UploadService.confirmFile(mediaFile);
  }

  // Called after the DB now points to a new file (GBR-43): drop the old row and object
  static async discardFile(mediaFile: MusicLibrary.MediaFileRecord | null | undefined): Promise<void> {
    if (!mediaFile) return;
    if (await MediaFileRepository.countUsages(mediaFile.id) > 0) return;
    await MediaFileRepository.deleteById(mediaFile.id);
    await StorageService.deleteQuietly(mediaFile.storageKey);
  }
}
