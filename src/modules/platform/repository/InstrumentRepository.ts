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
    const records = await InstrumentRepository.client.instrument.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDir },
      include: { _count: { select: { tunes: true } } }
    });
    return records.map((record) => ({
      ...record,
      tunesCount: record._count.tunes
    }));
  }

  static async findById(id: string): Promise<Backend.InstrumentRecord | null> {
    const record = await InstrumentRepository.client.instrument.findUnique({
      where: { id },
      include: { tunes: { orderBy: [{ displayOrder: 'asc' }, { pitch: 'asc' }] }, _count: { select: { tunes: true } } }
    });
    if (!record) return null;
    return {
      ...record,
      tunesCount: record._count.tunes
    };
  }

  static async findByCode(code: string): Promise<Backend.InstrumentRecord | null> {
    return InstrumentRepository.client.instrument.findUnique({ where: { code } });
  }

  static async listTunes(instrumentId: string): Promise<Backend.InstrumentTuneRecord[]> {
    return InstrumentRepository.client.instrumentTune.findMany({
      where: { instrumentId },
      orderBy: [{ displayOrder: 'asc' }, { pitch: 'asc' }, { createdAt: 'asc' }]
    });
  }

  static async replaceTunes(instrumentId: string, tunes: Backend.InstrumentTuneInput[]): Promise<Backend.InstrumentTuneRecord[]> {
    return InstrumentRepository.client.$transaction(async (tx) => {
      await tx.instrumentTune.deleteMany({ where: { instrumentId } });
      if (tunes.length > 0) {
        await tx.instrumentTune.createMany({
          data: tunes.map((tune, index) => ({
            instrumentId,
            tuneName: tune.tuneName,
            pitch: tune.pitch,
            displayOrder: tune.displayOrder ?? index + 1
          }))
        });
      }
      return tx.instrumentTune.findMany({
        where: { instrumentId },
        orderBy: [{ displayOrder: 'asc' }, { pitch: 'asc' }, { createdAt: 'asc' }]
      });
    });
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

