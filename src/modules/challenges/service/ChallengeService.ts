import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import NotificationService from '../../platform/service/NotificationService.ts';
import ChallengeConstant from '../constant/ChallengeConstant.ts';
import ChallengeDTO from '../dto/ChallengeDTO.ts';
import ChallengeRepository from '../repository/ChallengeRepository.ts';
import ChallengeAccessService from './ChallengeAccessService.ts';
import ChallengeReferenceService from './ChallengeReferenceService.ts';
import ChallengeRules from './ChallengeRules.ts';
import ChallengeWeekCalculator from './ChallengeWeekCalculator.ts';

const messages = ChallengeConstant.messages;

type ChallengeFields = Omit<Backend.ChallengeInput, 'publish'>;
interface SavePlan {
  challengeId: string | null;
  fields: ChallengeFields;
  // undefined keeps the stored classes (PATCH without classIds)
  classIds: string[] | undefined;
  publish: boolean;
  // publish endpoint: re-read the draft fields inside the transaction instead of trusting the earlier read
  reloadFields: boolean;
}

// Lifecycle of a weekly challenge: draft -> publish (one transaction), edit / delete only while DRAFT.
export default class ChallengeService {
  static async create(lecturerId: string, input: Backend.ChallengeInput): Promise<Backend.ChallengeDTO> {
    const { publish, ...fields } = input;
    ChallengeService.assertValid(fields, publish);
    const plan = await ChallengeService.buildPlan(lecturerId, null, fields, fields.classIds, publish, { checkClasses: true, checkPiece: true });
    return ChallengeService.save(lecturerId, plan);
  }

  static async update(lecturerId: string, challengeId: string, patch: Backend.ChallengePatchInput): Promise<Backend.ChallengeDTO> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    ChallengeAccessService.assertDraft(record, 'sửa thử thách');
    const fields = ChallengeService.mergePatch(ChallengeService.toFields(record), patch);
    ChallengeService.assertValid(fields, false);
    const touchesInstrument = patch.instrumentId !== undefined;
    const plan = await ChallengeService.buildPlan(lecturerId, challengeId, fields, patch.classIds, false, {
      checkClasses: patch.classIds !== undefined || touchesInstrument,
      checkPiece: patch.pieceId !== undefined || touchesInstrument
    });
    return ChallengeService.save(lecturerId, plan);
  }

  static async remove(lecturerId: string, challengeId: string): Promise<void> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    ChallengeAccessService.assertDraft(record, 'xóa thử thách');
    const isDeleted = await PrismaClientProvider.instance.$transaction((transaction) => ChallengeRepository.delete(challengeId, transaction));
    if (!isDeleted) throw AppError.conflict(messages.NOT_DRAFT('xóa thử thách'), { code: 'MSG-08' });
  }

  static async publish(lecturerId: string, challengeId: string): Promise<Backend.ChallengeDTO> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    ChallengeAccessService.assertDraft(record, 'đăng thử thách');
    const fields = ChallengeService.toFields(record);
    ChallengeService.assertValid(fields, true);
    const plan = await ChallengeService.buildPlan(lecturerId, challengeId, fields, undefined, true, { checkClasses: true, checkPiece: true });
    return ChallengeService.save(lecturerId, { ...plan, reloadFields: true });
  }

  static toFields(record: Backend.ChallengeRecord): ChallengeFields {
    return {
      title: record.title,
      description: record.description,
      instrumentId: record.instrumentId,
      pieceId: record.pieceId,
      classIds: record.classes.map((item) => item.class.id),
      weekStart: record.startsAt ? ChallengeDTO.weekStartOf(record.startsAt) : null,
      minAccuracy: record.minAccuracy,
      requiredBpm: record.requiredBpm,
      maxSubmissions: record.maxSubmissions
    };
  }

  static mergePatch(current: ChallengeFields, patch: Backend.ChallengePatchInput): ChallengeFields {
    return {
      title: patch.title ?? current.title,
      description: patch.description === undefined ? current.description : patch.description || null,
      instrumentId: patch.instrumentId === undefined ? current.instrumentId : patch.instrumentId,
      pieceId: patch.pieceId === undefined ? current.pieceId : patch.pieceId,
      classIds: patch.classIds ?? current.classIds,
      weekStart: patch.weekStart === undefined ? current.weekStart : patch.weekStart,
      minAccuracy: patch.minAccuracy === undefined ? current.minAccuracy : patch.minAccuracy,
      requiredBpm: patch.requiredBpm === undefined ? current.requiredBpm : patch.requiredBpm,
      maxSubmissions: patch.maxSubmissions ?? current.maxSubmissions
    };
  }

  static assertValid(fields: ChallengeFields, isPublishing: boolean): void {
    const rulesInput = { ...fields, weekMonday: fields.weekStart };
    const errors = isPublishing ? ChallengeRules.validatePublish(rulesInput) : ChallengeRules.validateDraft(rulesInput);
    if (errors.length > 0) {
      throw new AppError(errors[0].message, 400, { code: errors[0].code, field: errors[0].field, fieldErrors: errors });
    }
  }

  // Drafts are checked here; a publish repeats every reference check inside its transaction (see persist).
  static async buildPlan(
    lecturerId: string,
    challengeId: string | null,
    fields: ChallengeFields,
    classIds: string[] | undefined,
    publish: boolean,
    checks: { checkClasses: boolean; checkPiece: boolean }
  ): Promise<SavePlan> {
    ChallengeReferenceService.assertWeek(fields.weekStart, new Date());
    if (!publish && checks.checkClasses) await ChallengeReferenceService.assertClasses(fields.classIds, fields.instrumentId, lecturerId, { requireStudents: false });
    if (!publish && checks.checkPiece) await ChallengeReferenceService.assertPiece(fields.pieceId, fields.instrumentId, { requireReady: false });
    return { challengeId, fields, classIds, publish, reloadFields: false };
  }

  static async save(lecturerId: string, plan: SavePlan): Promise<Backend.ChallengeDTO> {
    let challengeId: string;
    try {
      challengeId = await PrismaClientProvider.instance.$transaction((transaction) => ChallengeService.persist(lecturerId, plan, transaction));
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error(error);
      throw new AppError(messages.PUBLISH_FAILED, 500, { code: 'MSG-09' });
    }
    const saved = await ChallengeRepository.findById(challengeId);
    if (!saved) throw AppError.notFound(messages.CHALLENGE_NOT_FOUND);
    return ChallengeDTO.toDTO(saved);
  }

  static async persist(lecturerId: string, plan: SavePlan, transaction: Prisma.TransactionClient): Promise<string> {
    const now = new Date();
    let fields = plan.fields;
    let classNames: string[] = [];
    let sheetMusicId: string | null = null;

    if (plan.publish) {
      // Serialise this lecturer's publishes, then validate everything against the state this transaction sees.
      await ChallengeRepository.lockLecturer(lecturerId, transaction);
      if (plan.challengeId) {
        await ChallengeRepository.lockChallenge(plan.challengeId, transaction);
        const current = await ChallengeRepository.findById(plan.challengeId, transaction);
        if (!current || current.createdById !== lecturerId) throw AppError.notFound(messages.CHALLENGE_NOT_FOUND);
        ChallengeAccessService.assertDraft(current, 'đăng thử thách');
        if (plan.reloadFields) {
          fields = ChallengeService.toFields(current);
          ChallengeService.assertValid(fields, true);
        }
      }
      ChallengeReferenceService.assertWeek(fields.weekStart, now);
      const classes = await ChallengeReferenceService.assertClasses(fields.classIds, fields.instrumentId, lecturerId, { requireStudents: true }, transaction);
      classNames = classes.map((item) => item.name);
      sheetMusicId = await ChallengeReferenceService.assertPiece(fields.pieceId, fields.instrumentId, { requireReady: true }, transaction);
    }

    const bounds = fields.weekStart ? ChallengeWeekCalculator.weekBounds(fields.weekStart) : null;
    const period = plan.publish && fields.weekStart ? ChallengeWeekCalculator.resolvePeriod(fields.weekStart, now) : bounds;

    if (plan.publish && period && fields.instrumentId) {
      const overlapping = await ChallengeRepository.findOverlappingClassIds(
        { lecturerId, instrumentId: fields.instrumentId, classIds: fields.classIds, startsAt: period.startsAt, endsAt: period.endsAt, excludeChallengeId: plan.challengeId ?? undefined },
        transaction
      );
      if (overlapping.length > 0) throw AppError.conflict(messages.CLASS_OVERLAP, { code: 'MSG-08' });
    }

    const data = {
      title: fields.title,
      description: fields.description,
      instrumentId: fields.instrumentId,
      pieceId: fields.pieceId,
      sheetMusicId,
      minAccuracy: fields.minAccuracy,
      requiredBpm: fields.requiredBpm,
      maxSubmissions: fields.maxSubmissions,
      status: plan.publish ? ('PUBLISHED' as const) : ('DRAFT' as const),
      startsAt: period?.startsAt ?? null,
      endsAt: period?.endsAt ?? null,
      publishedAt: plan.publish ? now : null
    };
    let challengeId = plan.challengeId;
    if (challengeId) {
      const isUpdated = await ChallengeRepository.update(challengeId, data, plan.classIds ?? (plan.publish ? fields.classIds : undefined), transaction);
      if (!isUpdated) throw AppError.conflict(messages.NOT_DRAFT(plan.publish ? 'đăng thử thách' : 'sửa thử thách'), { code: 'MSG-08' });
    } else {
      challengeId = (await ChallengeRepository.create(lecturerId, data, fields.classIds, transaction)).id;
    }

    if (plan.publish) await ChallengeService.recordPublish(lecturerId, challengeId, fields, classNames, transaction);
    return challengeId;
  }

  static async recordPublish(lecturerId: string, challengeId: string, fields: ChallengeFields, classNames: string[], transaction: Prisma.TransactionClient): Promise<void> {
    await AuditLogger.record(
      {
        actorId: lecturerId,
        action: ChallengeConstant.auditActions.CHALLENGE_PUBLISH,
        entityType: ChallengeConstant.auditEntityType,
        entityId: challengeId,
        payload: { instrumentId: fields.instrumentId, pieceId: fields.pieceId, classIds: fields.classIds, weekStart: fields.weekStart }
      },
      transaction
    );
    // A student in several selected classes receives one notification (notifyUsers de-duplicates ids).
    const memberIds = new Set<string>();
    for (const classId of fields.classIds) {
      for (const memberId of await MemberRepository.findActiveMemberIds(classId, transaction)) memberIds.add(memberId);
    }
    const notifications = ChallengeConstant.notifications;
    await NotificationService.notifyUsers(
      lecturerId,
      [...memberIds],
      { title: notifications.PUBLISHED_TITLE, body: notifications.body(classNames.join(', '), fields.title), link: notifications.link(challengeId) },
      transaction
    );
  }
}
