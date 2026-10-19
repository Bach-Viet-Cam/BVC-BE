import PrismaClientProvider from '../../../config/PrismaClient.ts';
import FileStorageService from '../../storage/service/FileStorageService.ts';
import FileStorageFactoryService from '../../storage/service/FileStorageFactoryService.ts';
import AudioConstant from '../constant/AudioConstant.ts';
import AudioRepository from '../repository/AudioRepository.ts';

export default class AudioCleanupService {
  constructor(private readonly storage: FileStorageService = new FileStorageFactoryService().create(), private readonly repository: AudioRepository = new AudioRepository()) {}

  async run(): Promise<number> {
    const uploads = await this.repository.claimOrphans(new Date(Date.now() - AudioConstant.orphanRetentionMs));
    let deleted = 0;
    for (const upload of uploads) {
      if (upload.provider !== this.storage.provider) continue;
      try {
        await this.storage.delete(upload.key);
        await this.repository.deleteClaimedUpload(upload.id);
        deleted += 1;
      } catch { console.error('Không thể dọn một file audio hết hạn.'); }
    }
    return deleted;
  }

  static async execute(): Promise<void> {
    try { console.log(`Đã dọn ${await new AudioCleanupService().run()} file audio chưa sử dụng.`); }
    finally { await PrismaClientProvider.instance.$disconnect(); }
  }
}
