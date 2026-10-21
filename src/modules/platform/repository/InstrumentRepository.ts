import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

export default class InstrumentRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async list(query: Backend.InstrumentListQuery): Promise<Backend.InstrumentRecord[]> {
    const where: Prisma.InstrumentWhereInput = {};
    if (query.status !== 'all') where.isActive = query.status === 'active';
    if (query.q) {
      where.OR = [
        { code: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } }
      ];
    }
    return InstrumentRepository.client.instrument.findMany({ where, orderBy: { [query.sortBy]: query.sortDir } });
  }

  static async findById(id: string): Promise<Backend.InstrumentRecord | null> {
    return InstrumentRepository.client.instrument.findUnique({ where: { id } });
  }

  static async findByCode(code: string): Promise<Backend.InstrumentRecord | null> {
    return InstrumentRepository.client.instrument.findUnique({ where: { code } });
  }

  static async create(input: Backend.InstrumentInput): Promise<Backend.InstrumentRecord> {
    return InstrumentRepository.client.instrument.create({ data: input });
  }

  static async update(id: string, input: Backend.InstrumentUpdateInput): Promise<Backend.InstrumentRecord> {
    return InstrumentRepository.client.instrument.update({ where: { id }, data: input });
  }

  static async updateActive(id: string, isActive: boolean): Promise<Backend.InstrumentRecord> {
    return InstrumentRepository.client.instrument.update({ where: { id }, data: { isActive } });
  }
}
