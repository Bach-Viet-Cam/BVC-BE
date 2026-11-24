declare namespace Backend {
  interface GradingSettings {
    minAccuracy: number;
    atRiskMargin: number;
    updatedAt: string | null;
  }

  type LlmProvider = 'gemini' | 'openrouter';

  type LlmKeyStatus = 'active' | 'disabled' | 'invalid';

  interface LlmKeyItem {
    id: string;
    name: string;
    provider: LlmProvider;
    status: LlmKeyStatus;
    cooldownUntil: string | null;
    lastUsedAt: string | null;
    lastErrorCode: string | null;
    successCount: number;
    failCount: number;
    createdAt: string;
  }
}
