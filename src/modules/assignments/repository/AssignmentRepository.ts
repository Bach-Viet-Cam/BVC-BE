import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AssignmentModel from '../model/AssignmentModel.ts';

export default class AssignmentRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findById(assignmentId: string, client: Prisma.TransactionClient = AssignmentRepository.client): Promise<Backend.AssignmentRecord | null> {
    const record = await client.assignment.findUnique({ where: { id: assignmentId }, select: AssignmentModel.assignmentSelect });
    return record as Backend.AssignmentRecord | null;
  }

  static async findLecturerAssignments(lecturerId: string, query: Backend.AssignmentListQuery): Promise<{ records: Backend.AssignmentRecord[]; total: number }> {
    const where: Prisma.AssignmentWhereInput = {
      deletedAt: null,
      class: { lecturerId },
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind || query.q
        ? {
            currentVersion: {
              ...(query.kind ? { kind: query.kind } : {}),
              ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {})
            }
          }
        : {})
    };
    const [records, total] = await AssignmentRepository.client.$transaction([
      AssignmentRepository.client.assignment.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: AssignmentModel.assignmentSelect
      }),
      AssignmentRepository.client.assignment.count({ where })
    ]);
    return { records: records as Backend.AssignmentRecord[], total };
  }

  static async findPiece(pieceId: string): Promise<{ id: string; instrumentId: string; isVisible: boolean } | null> {
    return AssignmentRepository.client.piece.findUnique({ where: { id: pieceId }, select: { id: true, instrumentId: true, isVisible: true } });
  }

  static async createAssignment(
    data: { classId: string; createdById: string; status: Backend.AssignmentStatus; publishedAt: Date | null },
    client: Prisma.TransactionClient
  ): Promise<{ id: string }> {
    return client.assignment.create({ data, select: { id: true } });
  }

  static async findMaxVersion(assignmentId: string, client: Prisma.TransactionClient): Promise<number> {
    const result = await client.assignmentVersion.aggregate({ where: { assignmentId }, _max: { version: true } });
    return result._max.version ?? 0;
  }

  static async createVersionAndMakeCurrent(
    assignmentId: string,
    version: number,
    content: Backend.AssignmentContentInput,
    createdById: string,
    client: Prisma.TransactionClient
  ): Promise<void> {
    const created = await client.assignmentVersion.create({
      data: {
        assignmentId,
        version,
        title: content.title,
        description: content.description || null,
        kind: content.kind,
        pieceId: content.pieceId || null,
        requiredBpm: content.requiredBpm ?? null,
        createdById
      },
      select: { id: true }
    });
    await client.assignment.update({ where: { id: assignmentId }, data: { currentVersionId: created.id } });
  }

  static async updateAssignment(
    assignmentId: string,
    data: Partial<{ status: Backend.AssignmentStatus; publishedAt: Date | null; closedAt: Date | null; deletedAt: Date | null }>,
    client: Prisma.TransactionClient
  ): Promise<void> {
    await client.assignment.update({ where: { id: assignmentId }, data });
  }

  // A17: ending a class closes its published assignments.
  static async closePublishedForClass(classId: string, closedAt: Date, client: Prisma.TransactionClient): Promise<number> {
    const result = await client.assignment.updateMany({ where: { classId, status: 'PUBLISHED', deletedAt: null }, data: { status: 'CLOSED', closedAt } });
    return result.count;
  }
}
