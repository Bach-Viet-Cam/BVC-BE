import type { z } from 'zod';
import EnvConfig from '../../../config/EnvConfig.ts';
import AppError from '../../../utils/AppError.ts';
import AudioConstant from '../../audio/constant/AudioConstant.ts';
import LlmKeyValidation from '../validation/LlmKeyValidation.ts';

// Proxy to Rhythm's /api/v1/admin/llm-keys. Upstream bodies are only inspected for `detail.code`
// and never copied into an error message: they may echo request data and the key must not leak.
export default class LlmKeyClientService {
  private static readonly path = '/api/v1/admin/llm-keys';
  private static readonly unavailableMessage = 'Chưa thể kết nối dịch vụ quản lý API key.';

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly apiKey: string = EnvConfig.rhythmServiceInternalApiKey,
    private readonly baseUrl: string = EnvConfig.rhythmServiceBaseUrl
  ) {}

  async list(): Promise<Backend.LlmKeyItem[]> {
    return (await this.read(LlmKeyValidation.list, await this.send('GET', ''))).items;
  }

  async create(input: { name: string; key: string }): Promise<Backend.LlmKeyItem> {
    return this.read(LlmKeyValidation.item, await this.send('POST', '', input));
  }

  async update(id: string, input: { name?: string; status?: 'active' | 'disabled'; key?: string }): Promise<Backend.LlmKeyItem> {
    return this.read(LlmKeyValidation.item, await this.send('PATCH', `/${encodeURIComponent(id)}`, input));
  }

  async remove(id: string): Promise<void> {
    await this.send('DELETE', `/${encodeURIComponent(id)}`);
  }

  private async send(method: string, suffix: string, body?: unknown): Promise<Response> {
    if (!this.apiKey) throw new AppError(LlmKeyClientService.unavailableMessage, 503);
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}${LlmKeyClientService.path}${suffix}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(AudioConstant.requestTimeoutMs), redirect: 'error'
      });
    } catch {
      throw new AppError(LlmKeyClientService.unavailableMessage, 503);
    }
    if (response.ok) return response;
    throw await this.toError(response);
  }

  private async toError(response: Response): Promise<AppError> {
    let code = '';
    try {
      const body = await response.json() as { detail?: { code?: unknown } };
      if (typeof body?.detail?.code === 'string') code = body.detail.code;
    } catch {
      code = '';
    }
    if (response.status === 404) return new AppError('Không tìm thấy API key.', 404);
    if (response.status === 409) {
      if (code === 'LLM_KEY_DUPLICATE_NAME') return AppError.conflict('Tên API key đã tồn tại.', { field: 'name' });
      if (code === 'LLM_KEY_DUPLICATE_VALUE') return AppError.conflict('API key này đã được thêm trước đó.', { field: 'key' });
      return AppError.conflict('API key đã tồn tại.');
    }
    if (response.status === 422) return AppError.badRequest('Dữ liệu API key không hợp lệ.');
    return new AppError(LlmKeyClientService.unavailableMessage, 503);
  }

  private async read<T>(schema: z.ZodType<T>, response: Response): Promise<T> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AppError(LlmKeyClientService.unavailableMessage, 503);
    }
    const result = schema.safeParse(body);
    if (!result.success) throw new AppError(LlmKeyClientService.unavailableMessage, 503);
    return result.data;
  }
}
