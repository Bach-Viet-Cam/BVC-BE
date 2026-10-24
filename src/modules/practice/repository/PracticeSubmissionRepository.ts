import type { Prisma, PrismaClient } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import PracticeConstant from '../constant/PracticeConstant.ts';
import PracticeModel from '../model/PracticeModel.ts';

export default class PracticeSubmissionRepository {
  constructor(private readonly client: PrismaClient = PrismaClientProvider.instance) {}

  async findOwnedUpload(ownerId: string, uploadId: string): Promise<{ id: string; url: string } | null> {
    return this.client.audioUpload.findFirst({ where: { id: uploadId, ownerId, deletingAt: null }, select: { id: true, url: true } });
  }

  async findSheet(sheetMusicId: string): Promise<Practice.SheetTemplate | null> {
    return this.client.sheetMusic.findFirst({
      where: { id: sheetMusicId, visibility: 'PUBLIC', moderation: 'NORMAL', piece: { deletedAt: null } },
      select: PracticeModel.sheetSelect
    });
  }

  async findContextSheet(sheetMusicId: string): Promise<Practice.ContextSheet | null> {
    return this.client.sheetMusic.findFirst({
      where: { id: sheetMusicId, visibility: 'PUBLIC', moderation: 'NORMAL', piece: { deletedAt: null } },
      select: PracticeModel.contextSheetSelect
    });
  }

  // Reference recording of the MAIN sheet of the same piece and instrument (fallback for a sheet without its own)
  async findMainReferenceAudio(pieceId: string, instrumentId: string): Promise<{ storageKey: string; status: string } | null> {
    const main = await this.client.sheetMusic.findFirst({
      where: { pieceId, instrumentId, kind: 'MAIN', moderation: 'NORMAL' },
      select: { referenceAudio: { select: { storageKey: true, status: true } } }
    });
    return main?.referenceAudio ?? null;
  }

  // Every active membership, newest class first, each with its assignments of this piece. A student should have one,
  // but data can hold several (e.g. imported into two classes), so PracticeAssignmentResolver.pickEnrollment chooses.
  // A class may already be ENDED, which still explains the deadline.
  async findClassAssignments(studentId: string, pieceId: string): Promise<Practice.ClassAssignments[]> {
    const memberships = await this.client.classMember.findMany({
      where: { userId: studentId, removedAt: null },
      orderBy: [{ class: { startDate: 'desc' } }, { joinedAt: 'desc' }],
      select: {
        instrumentId: true,
        class: {
          select: {
            id: true,
            name: true,
            status: true,
            instrumentId: true,
            assignments: {
              where: { sheetMusic: { pieceId }, deletedAt: null, status: { in: ['PUBLISHED', 'CLOSED'] } },
              orderBy: { deadline: 'asc' },
              select: PracticeModel.classAssignmentsSelect(studentId)
            }
          }
        }
      }
    });
    return memberships.map((membership) => {
      const { assignments, ...classRecord } = membership.class;
      return { classRecord, assignments, memberInstrumentId: membership.instrumentId };
    });
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

  // SCR-01: newest first; id breaks ties so pages stay stable
  async findHistory(studentId: string, filter: Practice.HistoryFilter, page: { skip: number; take: number }): Promise<{ rows: Practice.HistoryRecord[]; total: number }> {
    const where = PracticeModel.historyWhere(studentId, filter);
    const [rows, total] = await this.client.$transaction([
      this.client.submission.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...page, select: PracticeModel.historySelect }),
      this.client.submission.count({ where })
    ]);
    return { rows, total };
  }

  async countByStatus(studentId: string): Promise<Partial<Record<Practice.SubmissionStatus, number>>> {
    const groups = await this.client.submission.groupBy({ by: ['status'], where: { studentId }, _count: { _all: true } });
    return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  }

  // Pieces the student has submitted to, for the history piece filter
  async findSubmittedPieces(studentId: string): Promise<Practice.HistoryPieceOptionDTO[]> {
    return this.client.piece.findMany({
      where: { submissions: { some: { studentId } } },
      orderBy: [{ titleNormalized: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true }
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
