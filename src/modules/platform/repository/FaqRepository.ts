import type { Faq, Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

export default class FaqRepository {
  static async list(where: Prisma.FaqWhereInput, page: number, pageSize: number): Promise<{items: Faq[]; total: number; page: number; pageSize: number}> {
    const [items, total] = await PrismaClientProvider.instance.$transaction([
      PrismaClientProvider.instance.faq.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      PrismaClientProvider.instance.faq.count({ where })
    ]);
    return { items, total, page, pageSize };
  }
  static async save(id: string | null, actorId: string, data: Prisma.FaqUncheckedCreateInput): Promise<Faq> {
    return PrismaClientProvider.instance.$transaction(async (tx) => {
      const result = id ? await tx.faq.update({ where: { id }, data: { ...data, updatedById: actorId } }) : await tx.faq.create({ data });
      await tx.auditLog.create({ data: { actorId, action: id ? 'FAQ_UPDATED' : 'FAQ_CREATED', entityType: 'Faq', entityId: result.id } });
      return result;
    });
  }
  static async remove(id: string, actorId: string): Promise<void> {
    await PrismaClientProvider.instance.$transaction(async (tx) => {
      await tx.faq.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId, action: 'FAQ_DELETED', entityType: 'Faq', entityId: id } });
    });
  }
}
