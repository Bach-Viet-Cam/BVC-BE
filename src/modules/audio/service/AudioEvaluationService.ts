import { randomUUID } from 'node:crypto';
import AppError from '../../../utils/AppError.ts';
import FileStorageService from '../../storage/service/FileStorageService.ts';
import AudioRepository from '../repository/AudioRepository.ts';
import AudioConstant from '../constant/AudioConstant.ts';
import AudioDTO from '../dto/AudioDTO.ts';
import RhythmPublisherService from './RhythmPublisherService.ts';
import RhythmClientService from './RhythmClientService.ts';

export default class AudioEvaluationService {
  constructor(
    private readonly storage: FileStorageService,
    private readonly publisher: RhythmPublisherService,
    private readonly repository: AudioRepository = new AudioRepository(),
    private readonly client: RhythmClientService = new RhythmClientService()
  ) {}

  async create(ownerId: string, input: Audio.EvaluationInput): Promise<Audio.EvaluationResponse> {
    const job: Audio.Job = { ...input, evaluationId: randomUUID(), messageId: randomUUID(), instrumentId: AudioConstant.instrumentCode, requestedAt: new Date().toISOString() };
    await this.repository.createRequest(ownerId, input, job, this.storage.provider);
    const state = await this.publisher.publish(job);
    try { await this.repository.updatePublication(job.evaluationId, state); } catch {
      throw new AppError('Chưa xác định được trạng thái gửi yêu cầu. Hãy kiểm tra lại bằng mã đã tạo.', 503, { details: { evaluationId: job.evaluationId, status: 'publish_unknown' } });
    }
    if (state !== 'published') throw new AppError(state === 'publish_failed'
      ? 'Không thể gửi yêu cầu vào hàng đợi. Vui lòng thử lại sau.'
      : 'Chưa xác định được yêu cầu đã vào hàng đợi. Hãy tiếp tục kiểm tra bằng mã đã tạo.', 503, { details: { evaluationId: job.evaluationId, status: state } });
    return new AudioDTO().pending(job.evaluationId, 'queued');
  }

  async get(ownerId: string, evaluationId: string): Promise<Audio.EvaluationResponse> {
    const record = await this.repository.findRequest(ownerId, evaluationId);
    if (!record) throw AppError.notFound('Không tìm thấy yêu cầu phân tích.');
    if (record.publicationState === 'publish_failed') return new AudioDTO().pending(evaluationId, 'publish_failed');
    const result = await this.client.get(evaluationId);
    if (result) return result;
    return new AudioDTO().pending(evaluationId, record.publicationState === 'published' ? 'queued' : record.publicationState as Audio.PublicationState);
  }
}
