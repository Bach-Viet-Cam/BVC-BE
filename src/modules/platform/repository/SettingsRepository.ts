import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PlatformConstant from '../constant/PlatformConstant.ts';

// Minimal key/value access to system_configs for the grading thresholds.
export default class SettingsRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findSettings(keys: string[], client: Prisma.TransactionClient = SettingsRepository.client): Promise<Array<{ key: string; value: string; updatedAt: Date }>> {
    return client.systemConfig.findMany({ where: { key: { in: keys } }, select: { key: true, value: true, updatedAt: true } });
  }

  static async upsertSetting(key: string, value: string, updatedById: string, client: Prisma.TransactionClient): Promise<void> {
    const { group, valueType, label, description } = PlatformConstant.atRiskMarginConfig;
    await client.systemConfig.upsert({
      where: { key },
      create: { key, value, valueType, group, label, description, updatedById },
      update: { value, updatedById }
    });
  }
}
