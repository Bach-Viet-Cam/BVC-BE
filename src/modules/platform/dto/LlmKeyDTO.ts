export default class LlmKeyDTO {
  static item(row: Backend.LlmKeyItem): Backend.LlmKeyItem {
    return {
      id: row.id, name: row.name, status: row.status, cooldownUntil: row.cooldownUntil, lastUsedAt: row.lastUsedAt,
      lastErrorCode: row.lastErrorCode, successCount: row.successCount, failCount: row.failCount, createdAt: row.createdAt
    };
  }
}
