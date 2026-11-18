declare namespace Backend {
  interface GradingSettings {
    minAccuracy: number;
    atRiskMargin: number;
    updatedAt: string | null;
  }

  type LlmKeyStatus = 'active' | 'disabled' | 'invalid';

  interface LlmKeyItem {
    id: string;
    name: string;
    status: LlmKeyStatus;
    cooldownUntil: string | null;
    lastUsedAt: string | null;
    lastErrorCode: string | null;
    successCount: number;
    failCount: number;
    createdAt: string;
  }
}
