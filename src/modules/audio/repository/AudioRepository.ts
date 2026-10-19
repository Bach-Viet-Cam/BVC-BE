import { Prisma, type PrismaClient } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import AudioModel from '../model/AudioModel.ts';
import AudioConstant from '../constant/AudioConstant.ts';

export default class AudioRepository {
  constructor(private readonly client: PrismaClient = PrismaClientProvider.instance) {}

  async createUpload(input: { ownerId: string; provider: string; key: string; url: string; originalName: string; contentType: string; sizeBytes: number }): Promise<{ id: string; url: string }> {
    return this.client.audioUpload.create({ data: input, select: { id: true, url: true } });
  }

  async createRequest(ownerId: string, input: Audio.EvaluationInput, job: Audio.Job, provider: string): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${AudioConstant.cleanupLockId}::bigint)::text`;
      const uploads = await transaction.audioUpload.findMany({
        where: { ownerId, provider, url: { in: [input.templateUrl, input.studentUrl] }, deletingAt: null }, select: AudioModel.uploadSelect
      });
      const template = uploads.find((upload) => upload.url === input.templateUrl);
      const student = uploads.find((upload) => upload.url === input.studentUrl);
      if (!template || !student) throw AppError.badRequest('URL audio không hợp lệ hoặc bạn không có quyền sử dụng file.');
      await transaction.audioEvaluationRequest.create({ data: {
        evaluationId: job.evaluationId, messageId: job.messageId, ownerId, templateUploadId: template.id,
        studentUploadId: student.id, instrumentCode: job.instrumentId, publicationState: 'publishing'
      } });
    });
  }

  async updatePublication(evaluationId: string, publicationState: Audio.PublicationState): Promise<void> {
    await this.client.audioEvaluationRequest.update({ where: { evaluationId }, data: {
      publicationState, ...(publicationState === 'published' ? { publishedAt: new Date() } : {}),
      lastErrorCode: publicationState === 'publish_failed' || publicationState === 'publish_unknown' ? publicationState.toUpperCase() : null
    } });
  }

  async findRequest(ownerId: string, evaluationId: string): Promise<{ evaluationId: string; ownerId: string; publicationState: string } | null> {
    return this.client.audioEvaluationRequest.findFirst({ where: { ownerId, evaluationId }, select: AudioModel.requestSelect });
  }

  async claimOrphans(before: Date): Promise<{ id: string; provider: string; key: string }[]> {
    return this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${AudioConstant.cleanupLockId}::bigint)::text`;
      const uploads = await transaction.audioUpload.findMany({
        where: { createdAt: { lt: before }, templateEvaluations: { none: {} }, studentEvaluations: { none: {} } },
        orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, provider: true, key: true }
      });
      if (uploads.length) await transaction.audioUpload.updateMany({ where: { id: { in: uploads.map((upload) => upload.id) } }, data: { deletingAt: new Date() } });
      return uploads;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async deleteClaimedUpload(id: string): Promise<void> {
    await this.client.audioUpload.deleteMany({ where: { id, deletingAt: { not: null }, templateEvaluations: { none: {} }, studentEvaluations: { none: {} } } });
  }
}
