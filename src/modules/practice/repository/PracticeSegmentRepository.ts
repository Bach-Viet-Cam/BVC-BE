import type { Prisma, PrismaClient } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PracticeModel from '../model/PracticeModel.ts';

// Segment practice attempts live in their own table, so they never touch the submission they were practised from
export default class PracticeSegmentRepository {
  constructor(private readonly client: PrismaClient = PrismaClientProvider.instance) {}

  async findOriginal(submissionId: string, studentId: string): Promise<Practice.SegmentOrigin | null> {
    return this.client.submission.findFirst({ where: { id: submissionId, studentId }, select: PracticeModel.segmentOriginSelect });
  }

  async create(data: Practice.SegmentCreateData): Promise<Practice.SegmentRecord> {
    return this.client.practiceSegmentAttempt.create({
      data: { ...data, status: 'PROCESSING', stage: 'QUALITY_CHECK', stageStartedAt: new Date(), publicationState: 'publishing' }
    });
  }

  async findOwned(id: string, studentId: string): Promise<Practice.SegmentRecord | null> {
    return this.client.practiceSegmentAttempt.findFirst({ where: { id, studentId } });
  }

  async findById(id: string): Promise<Practice.SegmentRecord | null> {
    return this.client.practiceSegmentAttempt.findUnique({ where: { id } });
  }

  async findByEvaluationId(evaluationId: string): Promise<Practice.SegmentRecord | null> {
    return this.client.practiceSegmentAttempt.findUnique({ where: { evaluationId } });
  }

  // Applies only while the attempt is still in the given status and attempt, so late or duplicate events are ignored
  async updateIfCurrent(id: string, expected: { attempt: number; status: Practice.SubmissionStatus }, data: Practice.SegmentUpdate): Promise<boolean> {
    const { result, ...fields } = data;
    const { count } = await this.client.practiceSegmentAttempt.updateMany({
      where: { id, attempt: expected.attempt, status: expected.status },
      data: { ...fields, ...(result ? { result: result as Prisma.InputJsonObject } : {}) }
    });
    return count > 0;
  }

  async updatePublication(id: string, data: { publicationState: string }): Promise<void> {
    await this.client.practiceSegmentAttempt.update({ where: { id }, data });
  }

  // The latest completed attempt before this one on the same range (compared to 2 decimals)
  async findPreviousSameRange(record: Practice.SegmentRecord): Promise<Practice.SegmentRecord | null> {
    const earlier = await this.client.practiceSegmentAttempt.findMany({
      where: { submissionId: record.submissionId, status: 'COMPLETED', createdAt: { lt: record.createdAt } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });
    const toCentis = (seconds: number): number => Math.round(seconds * 100);
    return earlier.find((attempt) => toCentis(attempt.startSec) === toCentis(record.startSec) && toCentis(attempt.endSec) === toCentis(record.endSec)) ?? null;
  }

  // Newest first; id breaks ties so cursor pages stay stable
  async listBySubmission(submissionId: string, studentId: string, page: { cursor?: string; limit: number }): Promise<Practice.SegmentRecord[]> {
    return this.client.practiceSegmentAttempt.findMany({
      where: { submissionId, studentId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {})
    });
  }
}
