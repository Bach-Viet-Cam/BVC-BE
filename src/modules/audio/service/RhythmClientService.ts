import EnvConfig from '../../../config/EnvConfig.ts';
import AppError from '../../../utils/AppError.ts';
import AudioConstant from '../constant/AudioConstant.ts';
import AudioValidation from '../validation/AudioValidation.ts';

export default class RhythmClientService {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly apiKey: string = EnvConfig.rhythmServiceInternalApiKey,
    private readonly baseUrl: string = EnvConfig.rhythmServiceBaseUrl
  ) {}

  async get(evaluationId: string): Promise<Audio.EvaluationResponse | null> {
    if (!this.apiKey) throw new AppError('Chưa cấu hình kết nối dịch vụ phân tích.', 503);
    try {
      console.log(
        this.baseUrl+"/api/v1/evaluations/${encodeURIComponent(evaluationId)}",
        this.apiKey
      )
      const response = await this.request(`${this.baseUrl}/api/v1/evaluations/${encodeURIComponent(evaluationId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(AudioConstant.requestTimeoutMs), redirect: 'error'
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Dịch vụ phân tích chưa sẵn sàng.');
      const parsed = new AudioValidation().resultSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.evaluationId !== evaluationId) throw new Error('Kết quả phân tích không hợp lệ.');
      return parsed.data;
    } catch (error: any) {
      console.log(error.message);
      throw new AppError('Chưa thể lấy kết quả phân tích. Vui lòng thử kiểm tra lại.', 503);
    }
  }
}
