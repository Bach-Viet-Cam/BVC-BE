import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';

// Snapshot storage (D11): one snapshot per (semester, day); the API reads only from here.
export default class LeaderboardRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  // Idempotent: replaces the snapshot of the same semester and day, keeps every other day
  static async replaceSnapshot(transaction: Prisma.TransactionClient, header: Backend.LeaderboardSnapshotHeader, entries: Backend.LeaderboardEntryInput[]): Promise<string> {
    await transaction.leaderboardSnapshot.deleteMany({ where: { semester: header.semester, snapshotDate: DateTimeUtil.toDateOnly(header.snapshotDate) } });
    const snapshot = await transaction.leaderboardSnapshot.create({
      data: {
        semester: header.semester,
        periodStart: DateTimeUtil.toDateOnly(header.periodStart),
        periodEnd: DateTimeUtil.toDateOnly(header.periodEnd),
        weekStart: DateTimeUtil.toDateOnly(header.weekStart),
        snapshotDate: DateTimeUtil.toDateOnly(header.snapshotDate),
        startedAt: header.startedAt,
        generatedAt: header.generatedAt,
        durationMs: header.durationMs
      }
    });
    if (entries.length > 0) {
      await transaction.leaderboardEntry.createMany({
        data: entries.map((entry) => ({
          snapshotId: snapshot.id,
          category: entry.category,
          studentId: entry.studentId,
          classId: entry.classId,
          rank: entry.rank,
          position: entry.position,
          value: entry.value,
          criteria: (entry.criteria ?? undefined) as Prisma.InputJsonValue | undefined
        }))
      });
    }
    return snapshot.id;
  }

  // One transaction: a failure leaves the previous snapshot of the day as it was
  static async saveSnapshot(header: Backend.LeaderboardSnapshotHeader, entries: Backend.LeaderboardEntryInput[]): Promise<string> {
    return LeaderboardRepository.client.$transaction((transaction) => LeaderboardRepository.replaceSnapshot(transaction, header, entries), { timeout: 60_000 });
  }

  static async findLatest(semester: string): Promise<Backend.LeaderboardSnapshotRecord | null> {
    const snapshot = await LeaderboardRepository.client.leaderboardSnapshot.findFirst({ where: { semester }, orderBy: { generatedAt: 'desc' } });
    return snapshot ? LeaderboardRepository.toRecord(snapshot) : null;
  }

  static async findBySemesterAndDate(semester: string, snapshotDate: string): Promise<Backend.LeaderboardSnapshotRecord | null> {
    const snapshot = await LeaderboardRepository.client.leaderboardSnapshot.findUnique({
      where: { semester_snapshotDate: { semester, snapshotDate: DateTimeUtil.toDateOnly(snapshotDate) } }
    });
    return snapshot ? LeaderboardRepository.toRecord(snapshot) : null;
  }

  static async findPage(snapshotId: string, category: Backend.LeaderboardCategoryEnum, skip: number, take: number): Promise<Backend.LeaderboardEntryRecord[]> {
    const rows = await LeaderboardRepository.client.leaderboardEntry.findMany({
      where: { snapshotId, category },
      orderBy: { position: 'asc' },
      skip,
      take,
      include: { student: { select: { username: true } }, class: { select: { name: true } } }
    });
    return rows.map((row) => LeaderboardRepository.toEntry(row));
  }

  static async findEntry(snapshotId: string, category: Backend.LeaderboardCategoryEnum, studentId: string): Promise<Backend.LeaderboardEntryRecord | null> {
    const row = await LeaderboardRepository.client.leaderboardEntry.findUnique({
      where: { snapshotId_category_studentId: { snapshotId, category, studentId } },
      include: { student: { select: { username: true } }, class: { select: { name: true } } }
    });
    return row ? LeaderboardRepository.toEntry(row) : null;
  }

  static async countEntries(snapshotId: string, category: Backend.LeaderboardCategoryEnum): Promise<number> {
    return LeaderboardRepository.client.leaderboardEntry.count({ where: { snapshotId, category } });
  }

  private static toRecord(snapshot: { id: string; semester: string; snapshotDate: Date; generatedAt: Date }): Backend.LeaderboardSnapshotRecord {
    return { id: snapshot.id, semester: snapshot.semester, snapshotDate: DateTimeUtil.toIsoDate(snapshot.snapshotDate), generatedAt: snapshot.generatedAt };
  }

  private static toEntry(row: { studentId: string; rank: number; position: number; value: number; student: { username: string }; class: { name: string } }): Backend.LeaderboardEntryRecord {
    return { studentId: row.studentId, fullName: row.student.username, className: row.class.name, rank: row.rank, position: row.position, value: row.value };
  }
}
