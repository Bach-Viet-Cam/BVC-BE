import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

export default class AdminStatsRepository {
  static readonly briefSelect = {
    id: true,
    createdAt: true,
    fileUrl: true,
    student: { select: { username: true } },
    assignment: { select: { title: true } },
    piece: { select: { title: true } }
  } satisfies Prisma.SubmissionSelect;

  static get client() {
    return PrismaClientProvider.instance;
  }

  static async countActiveUsersSince(since: Date): Promise<number> {
    return AdminStatsRepository.client.user.count({ where: { lastLoginAt: { gte: since } } });
  }

  static async countSubmissionsSince(since: Date, status?: Backend.SubmissionStatusName): Promise<number> {
    return AdminStatsRepository.client.submission.count({
      where: { createdAt: { gte: since }, ...(status ? { status } : {}) }
    });
  }

  static async listSubmissionDatesSince(since: Date): Promise<Date[]> {
    const rows = await AdminStatsRepository.client.submission.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true }
    });
    return rows.map((row) => row.createdAt);
  }

  static async countProcessing(): Promise<number> {
    return AdminStatsRepository.client.submission.count({ where: { status: 'PROCESSING' } });
  }

  static async listProcessing(limit: number): Promise<Backend.SubmissionBrief[]> {
    return AdminStatsRepository.client.submission.findMany({
      where: { status: 'PROCESSING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: AdminStatsRepository.briefSelect
    });
  }

  static async listFailed(limit: number): Promise<Backend.SubmissionBrief[]> {
    return AdminStatsRepository.client.submission.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: AdminStatsRepository.briefSelect
    });
  }

  static async listRecentUsers(limit: number): Promise<Backend.AdminRecentUserRecord[]> {
    return AdminStatsRepository.client.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, username: true, email: true, role: true, status: true, createdAt: true }
    });
  }

  static async countActiveInstruments(): Promise<number> {
    return AdminStatsRepository.client.instrument.count({ where: { isActive: true } });
  }
}
