import type { Prisma, PrismaClient } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PracticeModel from '../model/PracticeModel.ts';

// Reads behind the M01 results screen. "Same exercise" = same student, same sheet and same assignment
// (no assignment = free practice), so class attempts and free practice keep separate histories.
export default class PracticeResultRepository {
  constructor(private readonly client: PrismaClient = PrismaClientProvider.instance) {}

  async findOwnedResult(id: string, studentId: string): Promise<Practice.ResultRecord | null> {
    return this.client.submission.findFirst({ where: { id, studentId }, select: PracticeModel.resultSelect });
  }

  // Newest first, up to and including the given submission
  async findCompletedAttempts(record: Practice.ResultRecord, limit: number): Promise<Practice.AttemptRecord[]> {
    return this.client.submission.findMany({
      where: { ...this.sameExerciseWhere(record), createdAt: { lte: record.createdAt } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true, accuracy: true, createdAt: true }
    });
  }

  async countCompletedUntil(record: Practice.ResultRecord): Promise<number> {
    return this.client.submission.count({ where: { ...this.sameExerciseWhere(record), createdAt: { lte: record.createdAt } } });
  }

  // Best completed accuracy of every other active member of the class on this assignment
  async findClassPeerBest(classId: string, assignmentId: string, excludedStudentId: string): Promise<number[]> {
    const groups = await this.client.submission.groupBy({
      by: ['studentId'],
      where: {
        assignmentId,
        status: 'COMPLETED',
        accuracy: { not: null },
        studentId: { not: excludedStudentId },
        student: { classMemberships: { some: { classId, removedAt: null } } }
      },
      _max: { accuracy: true }
    });
    return groups.flatMap((group) => (group._max.accuracy === null ? [] : [group._max.accuracy]));
  }

  async savePitchChart(id: string, chart: Practice.PitchChartDTO): Promise<void> {
    await this.client.submission.update({ where: { id }, data: { pitchChart: chart as unknown as Prisma.InputJsonObject } });
  }

  private sameExerciseWhere(record: Practice.ResultRecord): Prisma.SubmissionWhereInput {
    return { studentId: record.studentId, sheetMusicId: record.sheetMusicId, assignmentId: record.assignmentId, status: 'COMPLETED' };
  }
}
