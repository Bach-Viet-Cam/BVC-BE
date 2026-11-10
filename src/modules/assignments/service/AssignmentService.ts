import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import ClassRepository from '../../classes/repository/ClassRepository.ts';
import SemesterPolicyService from '../../classes/service/SemesterPolicyService.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import AssignmentAssignPolicyService from './AssignmentAssignPolicyService.ts';
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
    await AssignmentService.assertSheetMusicSelectable(input.sheetMusicId, classRecord.instrumentId);
    await AssignmentService.assertKindAvailable(input.classId, input.kind);

    const assignmentId = await PrismaClientProvider.instance.$transaction(async (transaction) => {
      const status: Backend.AssignmentStatus = input.publish ? 'PUBLISHED' : 'DRAFT';
      const createdId = await AssignmentService.insertAssignment(
        { classId: input.classId, lecturerId, content: input, status, publishedAt: input.publish ? new Date() : null, deadline: classRecord.endDate },
        transaction,
        { status }
      );
      if (input.publish) {
        await AssignmentService.notifyMembers(lecturerId, input.classId, classRecord.name, input.title, createdId, notifications.PUBLISHED_TITLE, transaction);
      }
      return createdId;
    });
    return AssignmentService.loadBaseDTO(assignmentId);
  }

  // Copy-on-create: inserts the assignments of a copied class inside the caller's transaction. No notifications are sent.
  static async createManyInTransaction(
    classId: string,
    lecturerId: string,
    items: Backend.CopyAssignmentInput[],
    deadline: Date,
    sourceClassId: string | null,
    transaction: Prisma.TransactionClient,
    now: Date = new Date()
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const item of items) {
      ids.push(
        await AssignmentService.insertAssignment(
          { classId, lecturerId, content: item, status: item.status, publishedAt: item.status === 'PUBLISHED' ? now : null, deadline },
          transaction,
          { status: item.status, copiedFromClassId: sourceClassId }
        )
      );
    }
    return ids;
  }

  // Shared by create and copy: assignment record, version 1 and CREATE audit entry.
  private static async insertAssignment(
    params: { classId: string; lecturerId: string; content: Backend.AssignmentContentInput; status: Backend.AssignmentStatus; publishedAt: Date | null; deadline: Date },
    transaction: Prisma.TransactionClient,
    auditPayload: Record<string, unknown>
  ): Promise<string> {
    const created = await AssignmentRepository.createAssignment(
      { classId: params.classId, createdById: params.lecturerId, status: params.status, publishedAt: params.publishedAt, deadline: params.deadline },
      params.content,
      transaction
    );
    await AssignmentRepository.createVersionAndMakeCurrent(created.id, 1, params.content, params.lecturerId, transaction);
    await AssignmentService.audit(params.lecturerId, auditActions.CREATE, created.id, transaction, auditPayload);
    return created.id;
  }

  // Bulk "assign to classes": every (source, class) pair is cloned into the class as a published assignment.
  // Pairs rejected by the planner are reported back instead of failing the request.
  static async assignToClasses(lecturerId: string, input: { assignmentIds: string[]; classIds: string[] }, now: Date = new Date()): Promise<Backend.AssignResultDTO> {
    const sources = (await Promise.all(input.assignmentIds.map((id) => AssignmentRepository.findById(id)))).filter(
      (record): record is Backend.AssignmentRecord & { currentVersion: NonNullable<Backend.AssignmentRecord['currentVersion']> } =>
        record !== null && record.deletedAt === null && record.currentVersion !== null && ClassAccessService.isClassLecturer(record.class, lecturerId)
    );
    if (sources.length === 0) throw AppError.notFound(messages.ASSIGNMENT_NOT_FOUND);

    const currentSemester = SemesterPolicyService.findCurrent(await SystemConfigService.getSemesters(), now);
    const classRecords = new Map<string, Backend.ClassRecord>();
    const targets: Backend.AssignPlanTarget[] = [];
    for (const classId of input.classIds) {
      const classRecord = await ClassRepository.findClassById(classId);
      if (!classRecord || !ClassAccessService.isClassLecturer(classRecord, lecturerId)) {
        // Unknown or foreign classes are reported as skipped without revealing which of the two it is.
        targets.push({ id: classId, cohort: '', status: 'ACTIVE', instrumentId: '', isLecturer: false, existing: [] });
        continue;
      }
      classRecords.set(classId, classRecord);
      targets.push({
        id: classId,
        cohort: classRecord.cohort,
        status: classRecord.status,
        instrumentId: classRecord.instrumentId,
        isLecturer: true,
        existing: await AssignmentRepository.findClassAssignmentKeys(classId)
      });
    }

    const planSources = sources.map((record) => ({ id: record.id, cohort: record.class.cohort, title: record.currentVersion.title, kind: record.currentVersion.kind, sheetMusicId: record.currentVersion.sheetMusic?.id ?? null }));
    const selectableSheets = new Set<string>();
    for (const sheetMusicId of new Set(planSources.flatMap((source) => (source.sheetMusicId ? [source.sheetMusicId] : [])))) {
      for (const instrumentId of new Set([...classRecords.values()].map((record) => record.instrumentId))) {
        if (await AssignmentRepository.isSheetMusicSelectable(sheetMusicId, instrumentId)) selectableSheets.add(`${sheetMusicId}:${instrumentId}`);
      }
    }

    const plan = AssignmentAssignPolicyService.plan({ sources: planSources, targets, currentSemesterName: currentSemester?.name ?? null, selectableSheets });
    const sourcesById = new Map(sources.map((record) => [record.id, record]));
    const createdIds: string[] = [];
    for (const pair of plan.toCreate) {
      const sourceVersion = sourcesById.get(pair.sourceId)!.currentVersion;
      const classRecord = classRecords.get(pair.classId)!;
      const content: Backend.AssignmentContentInput = {
        title: sourceVersion.title,
        description: sourceVersion.description,
        kind: sourceVersion.kind,
        sheetMusicId: sourceVersion.sheetMusic?.id ?? null,
        requiredBpm: sourceVersion.requiredBpm
      };
      // One transaction per pair: earlier clones stay when a later one fails (the error is rethrown, never hidden).
      createdIds.push(
        await PrismaClientProvider.instance.$transaction(async (transaction) => {
          const created = await AssignmentRepository.createAssignment(
            { classId: pair.classId, createdById: lecturerId, status: 'PUBLISHED', publishedAt: now, deadline: classRecord.endDate },
            content,
            transaction
          );
          await AssignmentRepository.createVersionAndMakeCurrent(created.id, 1, content, lecturerId, transaction);
          await AssignmentService.audit(lecturerId, auditActions.ASSIGN, created.id, transaction, { sourceId: pair.sourceId });
          await AssignmentService.notifyMembers(lecturerId, pair.classId, classRecord.name, content.title, created.id, notifications.PUBLISHED_TITLE, transaction);
          return created.id;
        })
      );
    }
    return { created: await Promise.all(createdIds.map((id) => AssignmentService.loadBaseDTO(id))), skipped: plan.skipped };
  }

  static async updateAssignment(assignmentId: string, lecturerId: string, input: Backend.AssignmentContentInput): Promise<Backend.AssignmentBaseDTO> {
    const record = await AssignmentAccessService.assertOwnedAssignment(assignmentId, lecturerId, { requireActiveClass: true });
    // User decision 19/10: saving without any change creates no version and sends no notification.
    if (AssignmentService.isUnchanged(record, input)) return AssignmentService.loadBaseDTO(assignmentId);
    await AssignmentService.assertSheetMusicSelectable(input.sheetMusicId, record.class.instrumentId);
    await AssignmentService.assertKindAvailable(record.classId, input.kind, assignmentId);

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
      (current.sheetMusic?.id ?? null) === (input.sheetMusicId ?? null) &&
      current.requiredBpm === (input.requiredBpm ?? null)
    );
  }

  static async assertKindAvailable(classId: string, kind: Backend.AssignmentKind, excludeAssignmentId?: string): Promise<void> {
    if (!AssignmentConstant.singleKinds.includes(kind)) return;
    if (await AssignmentRepository.existsKindInClass(classId, kind, excludeAssignmentId)) {
      throw AppError.fieldError(409, { field: 'kind', code: 'MSG-08', message: messages.KIND_TAKEN(kind) });
    }
  }

  // A15: any visible sheet music written for the class instrument (songs and finger exercises).
  static async assertSheetMusicSelectable(sheetMusicId: string | null | undefined, instrumentId: string): Promise<void> {
    if (!sheetMusicId) return;
    if (!(await AssignmentRepository.isSheetMusicSelectable(sheetMusicId, instrumentId))) {
      throw AppError.fieldError(400, { field: 'sheetMusicId', code: 'MSG-48', message: messages.SHEET_MUSIC_UNAVAILABLE });
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
