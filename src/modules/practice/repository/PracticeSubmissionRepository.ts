import type { Prisma, PrismaClient } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeModel from '../model/PracticeModel.ts';

export default class PracticeSubmissionRepository {
  constructor(private readonly client: PrismaClient = PrismaClientProvider.instance) {}

  async findOwnedUpload(ownerId: string, uploadId: string): Promise<{ id: string; url: string } | null> {
    return this.client.audioUpload.findFirst({ where: { id: uploadId, ownerId, deletingAt: null }, select: { id: true, url: true } });
  }

  async findSheet(pieceId: string, sheetMusicId: string): Promise<Practice.SheetTemplate | null> {
    return this.client.sheetMusic.findFirst({
      where: { id: sheetMusicId, pieceId, visibility: 'PUBLIC', moderation: 'NORMAL', piece: { deletedAt: null } },
      select: PracticeModel.sheetSelect
    });
  }

  async findAssignmentGate(assignmentId: string, studentId: string): Promise<Practice.AssignmentGate | null> {
    return this.client.assignment.findUnique({ where: { id: assignmentId }, select: PracticeModel.assignmentGateSelect(studentId) });
  }

  // GBR-49: the lock makes "no submission of this piece is processing" and the insert one atomic step
  async createIfIdle(data: Practice.SubmissionCreateData, now: Date): Promise<{ submission: Practice.SubmissionRecord | null; busyId: string | null }> {
    return this.client.$transaction(async (transaction) => {
      const lockKey = `${PracticeConstant.lockNamespace}:${data.studentId}:${data.pieceId}`;
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)::text`;
      const busy = await transaction.submission.findFirst({
        where: { studentId: data.studentId, pieceId: data.pieceId, status: 'PROCESSING' }, select: { id: true }
      });
      if (busy) return { submission: null, busyId: busy.id };
      const submission = await transaction.submission.create({
        data: { ...data, status: 'PROCESSING', stage: 'QUALITY_CHECK', stageStartedAt: now, publicationState: 'publishing' },
        select: PracticeModel.submissionSelect
      });
      return { submission, busyId: null };
    });
  }

  async findActiveProcessing(studentId: string, pieceId: string): Promise<Practice.SubmissionRecord | null> {
    return this.client.submission.findFirst({
      where: { studentId, pieceId, status: 'PROCESSING' }, orderBy: { createdAt: 'desc' }, select: PracticeModel.submissionSelect
    });
  }

  async findOwned(id: string, studentId: string): Promise<Practice.SubmissionRecord | null> {
    return this.client.submission.findFirst({ where: { id, studentId }, select: PracticeModel.submissionSelect });
  }

  async findById(id: string): Promise<Practice.SubmissionRecord | null> {
    return this.client.submission.findUnique({ where: { id }, select: PracticeModel.submissionSelect });
  }

  async findByEvaluationId(evaluationId: string): Promise<Practice.SubmissionRecord | null> {
    return this.client.submission.findUnique({ where: { evaluationId }, select: PracticeModel.submissionSelect });
  }

  // Applies only while the submission is still in the given status and attempt, so late or duplicate events are ignored
  async updateIfCurrent(id: string, expected: { attempt: number; status: Practice.SubmissionStatus }, data: Practice.SubmissionUpdate): Promise<boolean> {
    // The analysis result is stored as-is; it is plain JSON produced by the Rhythm service
    const { result, ...fields } = data;
    const { count } = await this.client.submission.updateMany({
      where: { id, attempt: expected.attempt, status: expected.status },
      data: { ...fields, ...(result ? { result: result as Prisma.InputJsonObject } : {}) }
    });
    return count > 0;
  }

  async updatePublication(id: string, data: { publicationState: string; messageId?: string }): Promise<void> {
    await this.client.submission.update({ where: { id }, data });
  }

  // GBR-62: the analysis file is gone, so the upload row is dropped and the submission keeps no audio link
  async markFileDeleted(id: string, uploadId: string | null, now: Date): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.submission.update({ where: { id }, data: { fileDeletedAt: now, fileUrl: null, studentUploadId: null } });
      if (uploadId) {
        await transaction.audioUpload.deleteMany({ where: { id: uploadId, templateEvaluations: { none: {} }, studentEvaluations: { none: {} }, submissions: { none: {} } } });
      }
    });
  }
}
