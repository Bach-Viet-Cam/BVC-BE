import { unlink } from 'node:fs/promises';
import FileStorageService from '../../storage/service/FileStorageService.ts';
import AudioConstant from '../constant/AudioConstant.ts';
import AudioRepository from '../repository/AudioRepository.ts';
import AudioFilePolicyService from './AudioFilePolicyService.ts';
import AudioPitchTrimService from './AudioPitchTrimService.ts';
import AudioDTO from '../dto/AudioDTO.ts';

export default class AudioUploadService {
  constructor(
    private readonly storage: FileStorageService,
    private readonly repository: AudioRepository = new AudioRepository(),
    private readonly pitchTrimmer: Pick<AudioPitchTrimService, 'trimFile'> = new AudioPitchTrimService()
  ) {}

  async upload(ownerId: string, file: Express.Multer.File | undefined, source: Audio.UploadSource = 'file'): Promise<{ fileId: string; url: string }> {
    let savedKey: string | undefined;
    try {
      const contentType = await new AudioFilePolicyService().validate(file);
      if (!file) throw new Error('Không tìm thấy file audio.');
      // File đã qua kiểm tra định dạng; cắt theo cao độ trước khi lưu (file tải lên: hai đầu, ghi âm trực tiếp: chỉ cuối; lỗi thì giữ bản gốc)
      await this.pitchTrimmer.trimFile(file.path, contentType === 'audio/wav' ? 'wav' : 'mp3', AudioConstant.trimEdgesBySource[source]);
      const saved = await this.storage.save({ sourcePath: file.path, originalName: file.originalname, contentType, namespace: 'audio' });
      savedKey = saved.key;
      const record = await this.repository.createUpload({
        ownerId, provider: this.storage.provider, ...saved, url: await this.storage.getDownloadUrl(saved.key), originalName: file.originalname
      });
      return new AudioDTO().upload(record);
    } catch (error) {
      if (savedKey) await this.storage.delete(savedKey).catch(() => console.error('Không thể dọn audio sau khi lưu metadata thất bại.'));
      throw error;
    } finally {
      if (file?.path) await unlink(file.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') console.error('Không thể dọn file audio tạm.');
      });
    }
  }
}
