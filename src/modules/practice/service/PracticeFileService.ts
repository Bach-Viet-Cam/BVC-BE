import FileStorageFactoryService from '../../storage/service/FileStorageFactoryService.ts';
import type FileStorageService from '../../storage/service/FileStorageService.ts';
import PracticeSubmissionRepository from '../repository/PracticeSubmissionRepository.ts';

export default class PracticeFileService {
  constructor(
    private readonly repository: PracticeSubmissionRepository = new PracticeSubmissionRepository(),
    private readonly createStorage: () => FileStorageService = () => new FileStorageFactoryService().create()
  ) {}

  // GBR-62: after the last retry fails the student's file is removed from the server
  async deleteStudentFile(record: Practice.SubmissionRecord, now: Date): Promise<void> {
    if (record.fileDeletedAt) return;
    if (record.studentUpload) {
      // Best effort like StorageService.deleteQuietly: a leftover object must not keep the submission stuck
      await this.createStorage().delete(record.studentUpload.key).catch(() => console.error('Không thể xóa file bản thu khỏi storage.'));
    }
    await this.repository.markFileDeleted(record.id, record.studentUpload?.id ?? null, now);
  }
}
