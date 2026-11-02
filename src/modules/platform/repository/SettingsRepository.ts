import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

// Minimal key/value access to system_configs for the grading thresholds.
export default class SettingsRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findSettings(keys: string[], client: Prisma.TransactionClient = SettingsRepository.client): Promise<Array<{ key: string; value: string; updatedAt: Date }>> {
    return client.systemConfig.findMany({ where: { key: { in: keys } }, select: { key: true, value: true, updatedAt: true } });
  }
}
