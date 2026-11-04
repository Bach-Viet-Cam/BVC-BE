import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AudioConstant from '../../audio/constant/AudioConstant.ts';
import VerifiedModel from '../model/VerifiedModel.ts';

type Source = Prisma.SubmissionGetPayload<{include: typeof VerifiedModel.sourceInclude}>;
type Record = Prisma.VerifiedContentGetPayload<{include: typeof VerifiedModel.include}>;

export default class VerifiedRepository {
  static async locked<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return PrismaClientProvider.instance.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${AudioConstant.cleanupLockId}::bigint)::text`;
      return work(tx);
    });
  }
  static async source(id: string, tx: Prisma.TransactionClient = PrismaClientProvider.instance): Promise<Source | null> {
    return tx.submission.findUnique({ where: { id }, include: VerifiedModel.sourceInclude });
  }
  static async find(id: string, tx: Prisma.TransactionClient = PrismaClientProvider.instance): Promise<Record | null> {
    return tx.verifiedContent.findUnique({ where: { id }, include: VerifiedModel.include });
  }
  static async list(where: Prisma.VerifiedContentWhereInput, page: number, pageSize: number, orderBy: Prisma.VerifiedContentOrderByWithRelationInput = { verifiedAt: 'desc' }): Promise<{items: Record[]; total: number; page: number; pageSize: number}> {
    const [items, total] = await PrismaClientProvider.instance.$transaction([
      PrismaClientProvider.instance.verifiedContent.findMany({ where, include: VerifiedModel.include, skip: (page - 1) * pageSize, take: pageSize, orderBy: [orderBy, { id: 'asc' }] }),
      PrismaClientProvider.instance.verifiedContent.count({ where })
    ]);
    return { items, total, page, pageSize };
  }
}
