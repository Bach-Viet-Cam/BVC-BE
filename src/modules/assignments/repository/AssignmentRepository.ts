import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import PieceUtil from '../../../utils/PieceUtil.ts';
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
      class: { ownerId: lecturerId },
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

  // Any non-deleted assignment of the class whose current version has this kind (drafts and closed ones included).
  static async existsKindInClass(classId: string, kind: Backend.AssignmentKind, excludeAssignmentId?: string): Promise<boolean> {
    const found = await AssignmentRepository.client.assignment.findFirst({
      where: {
        classId,
        deletedAt: null,
        currentVersion: { kind },
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {})
      },
      select: { id: true }
    });
    return found !== null;
  }

  // The piece is selectable when it is available and played on the class instrument.
  static async isPieceSelectable(pieceId: string, instrumentId: string): Promise<boolean> {
    const piece = await AssignmentRepository.client.piece.findUnique({
      where: { id: pieceId },
      select: { visibility: true, moderation: true, deletedAt: true, instruments: { where: { instrumentId }, select: { instrumentId: true } } }
    });
    return piece !== null && PieceUtil.isAvailable(piece) && piece.instruments.length > 0;
  }

  static async createAssignment(
    data: { classId: string; createdById: string; status: Backend.AssignmentStatus; publishedAt: Date | null; deadline: Date },
    content: Backend.AssignmentContentInput,
    client: Prisma.TransactionClient
  ): Promise<{ id: string }> {
    return client.assignment.create({ data: { ...data, ...AssignmentRepository.toMirror(content, data.status) }, select: { id: true } });
  }

  // Columns the student-side readers use; always written together with the version.
  static toMirror(content: Backend.AssignmentContentInput, status: Backend.AssignmentStatus) {
    return {
      title: content.title,
      description: content.description || '',
      type: AssignmentConstant.typeByKind[content.kind],
      pieceId: content.pieceId || null,
      targetBpm: content.requiredBpm ?? null,
      isPublished: status !== 'DRAFT'
    };
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
    const current = await client.assignment.findUniqueOrThrow({ where: { id: assignmentId }, select: { status: true } });
    await client.assignment.update({
      where: { id: assignmentId },
      data: { currentVersionId: created.id, ...AssignmentRepository.toMirror(content, current.status) }
    });
  }

  static async updateAssignment(
    assignmentId: string,
    data: Partial<{ status: Backend.AssignmentStatus; publishedAt: Date | null; closedAt: Date | null; deletedAt: Date | null }>,
    client: Prisma.TransactionClient
  ): Promise<void> {
    const isPublished = data.status ? { isPublished: data.status !== 'DRAFT' } : {};
    await client.assignment.update({ where: { id: assignmentId }, data: { ...data, ...isPublished } });
  }

  // The class end date is the deadline of every assignment of the class.
  static async syncDeadlines(classId: string, deadline: Date, client: Prisma.TransactionClient): Promise<void> {
    await client.assignment.updateMany({ where: { classId, deletedAt: null }, data: { deadline } });
  }

  // A17: ending a class closes its published assignments.
  static async closePublishedForClass(classId: string, closedAt: Date, client: Prisma.TransactionClient): Promise<number> {
    const result = await client.assignment.updateMany({ where: { classId, status: 'PUBLISHED', deletedAt: null }, data: { status: 'CLOSED', closedAt } });
    return result.count;
  }
}
