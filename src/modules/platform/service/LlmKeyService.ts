import AuditLogger from '../../../lib/AuditLogger.ts';
import LlmKeyClientService from './LlmKeyClientService.ts';

export default class LlmKeyService {
  private static client: LlmKeyClientService | null = null;

  private static getClient(): LlmKeyClientService {
    LlmKeyService.client ??= new LlmKeyClientService();
    return LlmKeyService.client;
  }

  static async list(): Promise<Backend.LlmKeyItem[]> {
    return LlmKeyService.getClient().list();
  }

  static async create(actorId: string, body: { name: string; key: string; provider: Backend.LlmProvider }): Promise<Backend.LlmKeyItem> {
    const item = await LlmKeyService.getClient().create(body);
    await AuditLogger.record({ actorId, action: 'LLM_KEY_CREATE', entityType: 'LLM_API_KEY', entityId: item.id, payload: { name: item.name, provider: item.provider } });
    return item;
  }

  static async update(actorId: string, id: string, body: { name?: string; status?: 'active' | 'disabled'; key?: string }): Promise<Backend.LlmKeyItem> {
    const item = await LlmKeyService.getClient().update(id, body);
    // Never put the key itself in the audit payload, only that it was replaced
    await AuditLogger.record({
      actorId, action: 'LLM_KEY_UPDATE', entityType: 'LLM_API_KEY', entityId: id,
      payload: { name: item.name, status: item.status, ...(body.key ? { keyReplaced: true } : {}) }
    });
    return item;
  }

  static async remove(actorId: string, id: string): Promise<void> {
    await LlmKeyService.getClient().remove(id);
    await AuditLogger.record({ actorId, action: 'LLM_KEY_DELETE', entityType: 'LLM_API_KEY', entityId: id });
  }
}
