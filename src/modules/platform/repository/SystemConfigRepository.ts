import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

export default class SystemConfigRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async list(query: Backend.SystemConfigListQuery): Promise<Backend.SystemConfigRecord[]> {
    const where: Prisma.SystemConfigWhereInput = {};
    if (query.group) where.group = query.group;
    if (query.q) {
      where.OR = [
        { label: { contains: query.q, mode: 'insensitive' } },
        { key: { contains: query.q, mode: 'insensitive' } },
        { value: { contains: query.q, mode: 'insensitive' } }
      ];
    }
    return SystemConfigRepository.client.systemConfig.findMany({
      where,
      orderBy: [{ [query.sortBy]: query.sortDir }, { key: 'asc' }]
    });
  }

  static async listAll(): Promise<Backend.SystemConfigRecord[]> {
    return SystemConfigRepository.client.systemConfig.findMany();
  }

  static async findById(id: string): Promise<Backend.SystemConfigRecord | null> {
    return SystemConfigRepository.client.systemConfig.findUnique({ where: { id } });
  }

  static async findByKey(key: string): Promise<Backend.SystemConfigRecord | null> {
    return SystemConfigRepository.client.systemConfig.findUnique({ where: { key } });
  }

  static async updateValue(id: string, value: string, updatedById: string): Promise<Backend.SystemConfigRecord> {
    return SystemConfigRepository.client.systemConfig.update({ where: { id }, data: { value, updatedById } });
  }
}
