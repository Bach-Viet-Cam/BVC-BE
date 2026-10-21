import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../config/PrismaClient.ts';

// Minimal audit trail (who / what / when). Pass the transaction client so the entry
// commits or rolls back together with the change it describes.
export default class AuditLogger {
  static async record(entry: Backend.AuditEntry, client: Prisma.TransactionClient = PrismaClientProvider.instance): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: (entry.payload ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
  }
}
