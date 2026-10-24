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
      const response = await this.request(`${this.baseUrl}/api/v1/evaluations/${encodeURIComponent(evaluationId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(AudioConstant.requestTimeoutMs), redirect: 'error'
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Dịch vụ phân tích chưa sẵn sàng.');
      const parsed = new AudioValidation().resultSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.evaluationId !== evaluationId) throw new Error('Kết quả phân tích không hợp lệ.');
      return parsed.data;
    } catch {
      throw new AppError('Chưa thể lấy kết quả phân tích. Vui lòng thử kiểm tra lại.', 503);
    }
  }

  // Pitch data behind a completed evaluation (teacher/student f0 + alignment); null when Rhythm has none for it.
  // The body is returned unparsed: the caller narrows it, since only the chart depends on its shape.
  async getAnalysis(evaluationId: string): Promise<unknown | null> {
    if (!this.apiKey) throw new AppError('Chưa cấu hình kết nối dịch vụ phân tích.', 503);
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/api/v1/evaluations/${encodeURIComponent(evaluationId)}/analysis`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(AudioConstant.requestTimeoutMs), redirect: 'error'
      });
    } catch {
      throw new AppError('Chưa thể lấy dữ liệu cao độ từ dịch vụ phân tích.', 503);
    }
    if (response.status === 404 || response.status === 409) return null;
    if (!response.ok) throw new AppError('Chưa thể lấy dữ liệu cao độ từ dịch vụ phân tích.', 503);
    const declaredBytes = Number(response.headers.get('content-length'));
    if (declaredBytes > AudioConstant.analysisMaxBytes) throw new AppError('File phân tích cao độ quá lớn.', 503);
    const body = await response.text();
    if (body.length > AudioConstant.analysisMaxBytes) throw new AppError('File phân tích cao độ quá lớn.', 503);
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new AppError('File phân tích cao độ không hợp lệ.', 503);
    }
  }

  // Starts a new attempt from the job that failed (GBR-63); false when the evaluation is unknown to Rhythm
  async retry(evaluationId: string, fromJob: Audio.JobCode, attempt: number): Promise<boolean> {
    if (!this.apiKey) throw new AppError('Chưa cấu hình kết nối dịch vụ phân tích.', 503);
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/api/v1/evaluations/${encodeURIComponent(evaluationId)}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromJob, attempt }),
        signal: AbortSignal.timeout(AudioConstant.requestTimeoutMs), redirect: 'error'
      });
    } catch {
      throw new AppError('Chưa thể gửi yêu cầu xử lý lại. Vui lòng thử lại sau.', 503);
    }
    if (response.status === 404) return false;
    if (!response.ok) throw new AppError('Chưa thể gửi yêu cầu xử lý lại. Vui lòng thử lại sau.', 503);
    return true;
  }
}
