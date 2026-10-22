import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';
import AssignmentDTO from '../dto/AssignmentDTO.ts';
import AssignmentRepository from '../repository/AssignmentRepository.ts';
import AssignmentAccessService from './AssignmentAccessService.ts';

const messages = AssignmentConstant.messages;
const auditActions = AssignmentConstant.auditActions;
const notifications = AssignmentConstant.notifications;

// Lifecycle of a practice assignment (spec §4.2): draft / publish / edit = new version / close / reopen / soft delete.
export default class AssignmentService {
  static async createAssignment(lecturerId: string, input: Backend.CreateAssignmentInput): Promise<Backend.AssignmentBaseDTO> {
    const classRecord = await ClassAccessService.assertOwnedClass(input.classId, lecturerId, { requireActive: true });
    await AssignmentService.assertPieceSelectable(input.pieceId, classRecord.instrumentId);

    const assignmentId = await PrismaClientProvider.instance.$transaction(async (transaction) => {
      const status: Backend.AssignmentStatus = input.publish ? 'PUBLISHED' : 'DRAFT';
      const created = await AssignmentRepository.createAssignment(
        { classId: input.classId, createdById: lecturerId, status, publishedAt: input.publish ? new Date() : null, deadline: classRecord.endDate },
        input,
        transaction
      );
      await AssignmentRepository.createVersionAndMakeCurrent(created.id, 1, input, lecturerId, transaction);
      await AssignmentService.audit(lecturerId, auditActions.CREATE, created.id, transaction, { status });
      if (input.publish) {
        await AssignmentService.notifyMembers(lecturerId, input.classId, classRecord.name, input.title, created.id, notifications.PUBLISHED_TITLE, transaction);
      }
      return created.id;
    });
    return AssignmentService.loadBaseDTO(assignmentId);
  }

  static async updateAssignment(assignmentId: string, lecturerId: string, input: Backend.AssignmentContentInput): Promise<Backend.AssignmentBaseDTO> {
    const record = await AssignmentAccessService.assertOwnedAssignment(assignmentId, lecturerId, { requireActiveClass: true });
    // User decision 19/10: saving without any change creates no version and sends no notification.
    if (AssignmentService.isUnchanged(record, input)) return AssignmentService.loadBaseDTO(assignmentId);
    await AssignmentService.assertPieceSelectable(input.pieceId, record.class.instrumentId);

    await PrismaClientProvider.instance.$transaction(async (transaction) => {
      const version = (await AssignmentRepository.findMaxVersion(assignmentId, transaction)) + 1;
      await AssignmentRepository.createVersionAndMakeCurrent(assignmentId, version, input, lecturerId, transaction);
      await AssignmentService.audit(lecturerId, auditActions.UPDATE, assignmentId, transaction, { version });
      if (record.status === 'PUBLISHED') {
        await AssignmentService.notifyMembers(lecturerId, record.classId, record.class.name, input.title, assignmentId, notifications.UPDATED_TITLE, transaction);
      }
    });
    return AssignmentService.loadBaseDTO(assignmentId);
  }

  static async publishAssignment(assignmentId: string, lecturerId: string): Promise<Backend.AssignmentBaseDTO> {
    const record = await AssignmentService.assertTransition(assignmentId, lecturerId, 'DRAFT', messages.INVALID_STATE('đăng bài tập', 'bài tập không ở trạng thái nháp'));
    await PrismaClientProvider.instance.$transaction(async (transaction) => {
      await AssignmentRepository.updateAssignment(assignmentId, { status: 'PUBLISHED', publishedAt: new Date() }, transaction);
      await AssignmentService.audit(lecturerId, auditActions.PUBLISH, assignmentId, transaction);
      const title = record.currentVersion?.title ?? '';
      await AssignmentService.notifyMembers(lecturerId, record.classId, record.class.name, title, assignmentId, notifications.PUBLISHED_TITLE, transaction);
    });
    return AssignmentService.loadBaseDTO(assignmentId);
  }

  static async closeAssignment(assignmentId: string, lecturerId: string): Promise<Backend.AssignmentBaseDTO> {
    await AssignmentService.assertTransition(assignmentId, lecturerId, 'PUBLISHED', messages.INVALID_STATE('đóng bài tập', 'bài tập chưa được đăng hoặc đã đóng'));
    return AssignmentService.changeStatus(assignmentId, lecturerId, { status: 'CLOSED', closedAt: new Date() }, auditActions.CLOSE);
  }

  static async reopenAssignment(assignmentId: string, lecturerId: string): Promise<Backend.AssignmentBaseDTO> {
    const record = await AssignmentService.assertTransition(assignmentId, lecturerId, 'CLOSED', messages.INVALID_STATE('mở lại bài tập', 'bài tập chưa bị đóng'));
    // User decision 19/10: reopening notifies members; closing and deleting do not.
    await PrismaClientProvider.instance.$transaction(async (transaction) => {
      await AssignmentRepository.updateAssignment(assignmentId, { status: 'PUBLISHED', closedAt: null }, transaction);
      await AssignmentService.audit(lecturerId, auditActions.REOPEN, assignmentId, transaction);
      const title = record.currentVersion?.title ?? '';
      await AssignmentService.notifyMembers(lecturerId, record.classId, record.class.name, title, assignmentId, notifications.REOPENED_TITLE, transaction);
    });
    return AssignmentService.loadBaseDTO(assignmentId);
  }

  // A10: soft delete; the assignment disappears for everyone and its submissions stop counting.
  static async deleteAssignment(assignmentId: string, lecturerId: string): Promise<void> {
    await AssignmentAccessService.assertOwnedAssignment(assignmentId, lecturerId, { requireActiveClass: true });
    await PrismaClientProvider.instance.$transaction(async (transaction) => {
      await AssignmentRepository.updateAssignment(assignmentId, { deletedAt: new Date() }, transaction);
      await AssignmentService.audit(lecturerId, auditActions.DELETE, assignmentId, transaction);
    });
  }

  static async closePublishedForClass(classId: string, client: Prisma.TransactionClient): Promise<number> {
    return AssignmentRepository.closePublishedForClass(classId, new Date(), client);
  }

  static async assertTransition(assignmentId: string, lecturerId: string, from: Backend.AssignmentStatus, message: string): Promise<Backend.AssignmentRecord> {
    const record = await AssignmentAccessService.assertOwnedAssignment(assignmentId, lecturerId, { requireActiveClass: true });
    if (record.status !== from) throw AppError.conflict(message, { code: 'MSG-08' });
    return record;
  }

  static async changeStatus(
    assignmentId: string,
    lecturerId: string,
    data: { status: Backend.AssignmentStatus; closedAt: Date | null },
    action: string
  ): Promise<Backend.AssignmentBaseDTO> {
    await PrismaClientProvider.instance.$transaction(async (transaction) => {
      await AssignmentRepository.updateAssignment(assignmentId, data, transaction);
      await AssignmentService.audit(lecturerId, action, assignmentId, transaction);
    });
    return AssignmentService.loadBaseDTO(assignmentId);
  }

  // Validation already trims and turns empty values into null, so a plain comparison is enough.
  static isUnchanged(record: Backend.AssignmentRecord, input: Backend.AssignmentContentInput): boolean {
    const current = record.currentVersion;
    if (!current) return false;
    return (
      current.title === input.title &&
      current.description === (input.description ?? null) &&
      current.kind === input.kind &&
      (current.piece?.id ?? null) === (input.pieceId ?? null) &&
      current.requiredBpm === (input.requiredBpm ?? null)
    );
  }

  // A15: any visible piece of the class instrument (songs and finger exercises).
  static async assertPieceSelectable(pieceId: string | null | undefined, instrumentId: string): Promise<void> {
    if (!pieceId) return;
    if (!(await AssignmentRepository.isPieceSelectable(pieceId, instrumentId))) {
      throw AppError.fieldError(400, { field: 'pieceId', code: 'MSG-48', message: messages.PIECE_UNAVAILABLE });
    }
  }

  static async notifyMembers(
    actorId: string,
    classId: string,
    className: string,
    title: string,
    assignmentId: string,
    notificationTitle: string,
    client: Prisma.TransactionClient
  ): Promise<void> {
    const memberIds = await MemberRepository.findActiveMemberIds(classId, client);
    await NotificationService.notifyUsers(
      actorId,
      [...memberIds],
      { title: notificationTitle, body: notifications.body(className, title), link: notifications.link(assignmentId) },
      client
    );
  }

  static async audit(actorId: string, action: string, assignmentId: string, client: Prisma.TransactionClient, payload?: Record<string, unknown>): Promise<void> {
    await AuditLogger.record({ actorId, action, entityType: AssignmentConstant.auditEntityType, entityId: assignmentId, payload }, client);
  }

  static async loadBaseDTO(assignmentId: string): Promise<Backend.AssignmentBaseDTO> {
    const record = await AssignmentRepository.findById(assignmentId);
    if (!record) throw AppError.notFound(messages.ASSIGNMENT_NOT_FOUND);
    return AssignmentDTO.toBaseDTO(record);
  }
}
