import { fileTypeFromBuffer } from 'file-type';
import { parseStream } from 'music-metadata';
import { PDFDocument } from 'pdf-lib';
import type { Readable } from 'node:stream';
import StorageService from '../../../lib/storage/StorageService.ts';
import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import CatalogService from './CatalogService.ts';

const MAGIC_BYTES_LENGTH = 4100;

// Server-side checks of an uploaded object: real type (magic bytes), real size, duration and page count
export default class MediaInspectionService {
  static getExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
  }

  static formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  static unsupportedFormat(fileRules: MusicLibrary.FileRules): AppError {
    return AppError.withMessage(400, 'MSG-13', { allowed_formats: fileRules.formatLabel }, 'file');
  }

  // Presign-time check on what the client declares (extension + size)
  static assertDeclaredFile(fileName: string, sizeBytes: number, fileRules: MusicLibrary.FileRules): void {
    if (!fileRules.extensions.includes(MediaInspectionService.getExtension(fileName))) {
      throw MediaInspectionService.unsupportedFormat(fileRules);
    }
    if (sizeBytes > fileRules.maxBytes) throw AppError.withMessage(400, 'MSG-14', { max_size: fileRules.maxMb }, 'file');
  }

  static async inspect(mediaFile: MusicLibrary.MediaFileRecord): Promise<MusicLibrary.InspectedFile> {
    const fileRules = await CatalogService.getFileRules(mediaFile.kind);
    const storedObject = await StorageService.driver.statObject(mediaFile.storageKey);
    if (!storedObject || storedObject.sizeBytes === 0) {
      throw AppError.withMessage(400, 'MSG-08', MusicLibraryConstant.messages.FILE_NOT_UPLOADED, 'file');
    }
    if (storedObject.sizeBytes > fileRules.maxBytes) throw AppError.withMessage(400, 'MSG-14', { max_size: fileRules.maxMb }, 'file');

    const detectedExtension = await MediaInspectionService.detectExtension(mediaFile.storageKey);
    if (!MediaInspectionService.isAcceptedType(mediaFile, detectedExtension)) throw MediaInspectionService.unsupportedFormat(fileRules);

    const inspectedFile: MusicLibrary.InspectedFile = { sizeBytes: storedObject.sizeBytes, durationSec: null, pageCount: null };
    if (mediaFile.kind === 'SHEET') inspectedFile.pageCount = await MediaInspectionService.countPages(mediaFile, detectedExtension, fileRules);
    if (mediaFile.kind === 'AUDIO' || mediaFile.kind === 'VIDEO') {
      inspectedFile.durationSec = await MediaInspectionService.readDuration(mediaFile, storedObject.sizeBytes, fileRules);
    }
    if (mediaFile.kind === 'AUDIO') await MediaInspectionService.assertAudioDuration(inspectedFile.durationSec ?? 0);
    return inspectedFile;
  }

  static async detectExtension(storageKey: string): Promise<string | undefined> {
    const headBytes = await StorageService.driver.readRange(storageKey, MAGIC_BYTES_LENGTH);
    const detectedType = await fileTypeFromBuffer(headBytes);
    return detectedType?.ext;
  }

  static isAcceptedType(mediaFile: MusicLibrary.MediaFileRecord, detectedExtension: string | undefined): boolean {
    if (!detectedExtension) return false;
    const acceptedExtensions: readonly string[] = MusicLibraryConstant.detectedExtensions[mediaFile.kind];
    if (!acceptedExtensions.includes(detectedExtension)) return false;
    // An ISO-BMFF "mp4" container is only accepted as audio when the user picked an .m4a file
    if (mediaFile.kind === 'AUDIO' && detectedExtension === 'mp4') {
      return MediaInspectionService.getExtension(mediaFile.originalName) === 'm4a';
    }
    return true;
  }

  static async countPages(
    mediaFile: MusicLibrary.MediaFileRecord,
    detectedExtension: string | undefined,
    fileRules: MusicLibrary.FileRules
  ): Promise<number> {
    if (detectedExtension !== 'pdf') return 1;
    try {
      const pdfDocument = await PDFDocument.load(await StorageService.driver.readObject(mediaFile.storageKey), { ignoreEncryption: true });
      return pdfDocument.getPageCount();
    } catch {
      throw MediaInspectionService.unsupportedFormat(fileRules);
    }
  }

  static async readDuration(
    mediaFile: MusicLibrary.MediaFileRecord,
    sizeBytes: number,
    fileRules: MusicLibrary.FileRules
  ): Promise<number> {
    try {
      const objectStream = await StorageService.driver.openReadStream(mediaFile.storageKey);
      const metadata = await parseStream(objectStream as Readable, { mimeType: mediaFile.mimeType, size: sizeBytes }, { duration: true });
      (objectStream as Readable).destroy?.();
      const durationSec = metadata.format.duration;
      if (!durationSec || !Number.isFinite(durationSec)) throw new Error('Missing duration');
      return Math.round(durationSec);
    } catch {
      throw MediaInspectionService.unsupportedFormat(fileRules);
    }
  }

  static async assertAudioDuration(durationSec: number): Promise<void> {
    const { minSec, maxSec } = await CatalogService.getAudioDurationRange();
    if (durationSec >= minSec && durationSec <= maxSec) return;
    throw AppError.withMessage(400, 'MSG-15', {
      min: MediaInspectionService.formatDuration(minSec),
      max: MediaInspectionService.formatDuration(maxSec)
    }, 'file');
  }
}
