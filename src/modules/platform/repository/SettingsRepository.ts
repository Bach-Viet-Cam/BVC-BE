import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

// TODO(M06): minimal key/value access to system_settings.
export default class SettingsRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findSettings(keys: string[], client: Prisma.TransactionClient = SettingsRepository.client): Promise<Array<{ key: string; value: string; updatedAt: Date }>> {
    return client.systemSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true, updatedAt: true } });
  }

  static async upsertSetting(key: string, value: string, updatedById: string, client: Prisma.TransactionClient): Promise<void> {
    await client.systemSetting.upsert({ where: { key }, create: { key, value, updatedById }, update: { value, updatedById } });
  }
}
