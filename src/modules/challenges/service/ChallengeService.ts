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
  classNames: string[];
  sheetMusicId: string | null;
  publish: boolean;
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
    await PrismaClientProvider.instance.$transaction((transaction) => ChallengeRepository.delete(challengeId, transaction));
  }

  static async publish(lecturerId: string, challengeId: string): Promise<Backend.ChallengeDTO> {
    const record = await ChallengeAccessService.assertOwnedChallenge(challengeId, lecturerId);
    ChallengeAccessService.assertDraft(record, 'đăng thử thách');
    const fields = ChallengeService.toFields(record);
    ChallengeService.assertValid(fields, true);
    const plan = await ChallengeService.buildPlan(lecturerId, challengeId, fields, undefined, true, { checkClasses: true, checkPiece: true });
    return ChallengeService.save(lecturerId, plan);
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

  static async buildPlan(
    lecturerId: string,
    challengeId: string | null,
    fields: ChallengeFields,
    classIds: string[] | undefined,
    publish: boolean,
    checks: { checkClasses: boolean; checkPiece: boolean }
  ): Promise<SavePlan> {
    ChallengeReferenceService.assertWeek(fields.weekStart, new Date());
    const classes = checks.checkClasses || publish
      ? await ChallengeReferenceService.assertClasses(fields.classIds, fields.instrumentId, lecturerId, { requireStudents: publish })
      : [];
    const sheetMusicId = checks.checkPiece || publish
      ? await ChallengeReferenceService.assertPiece(fields.pieceId, fields.instrumentId, { requireReady: publish })
      : null;
    return { challengeId, fields, classIds, classNames: classes.map((item) => item.name), sheetMusicId: publish ? sheetMusicId : null, publish };
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
    const { fields } = plan;
    const now = new Date();
    const bounds = fields.weekStart ? ChallengeWeekCalculator.weekBounds(fields.weekStart) : null;
    const period = plan.publish && fields.weekStart ? ChallengeWeekCalculator.resolvePeriod(fields.weekStart, now) : bounds;

    if (plan.publish && period && fields.instrumentId) {
      await ChallengeRepository.lockLecturer(lecturerId, transaction);
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
      sheetMusicId: plan.sheetMusicId,
      minAccuracy: fields.minAccuracy,
      requiredBpm: fields.requiredBpm,
      maxSubmissions: fields.maxSubmissions,
      status: plan.publish ? ('PUBLISHED' as const) : ('DRAFT' as const),
      startsAt: period?.startsAt ?? null,
      endsAt: period?.endsAt ?? null,
      publishedAt: plan.publish ? now : null
    };
    let challengeId = plan.challengeId;
    if (challengeId) await ChallengeRepository.update(challengeId, data, plan.classIds ?? (plan.publish ? fields.classIds : undefined), transaction);
    else challengeId = (await ChallengeRepository.create(lecturerId, data, fields.classIds, transaction)).id;

    if (plan.publish) await ChallengeService.recordPublish(lecturerId, challengeId, plan, transaction);
    return challengeId;
  }

  static async recordPublish(lecturerId: string, challengeId: string, plan: SavePlan, transaction: Prisma.TransactionClient): Promise<void> {
    const { fields } = plan;
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
      { title: notifications.PUBLISHED_TITLE, body: notifications.body(plan.classNames.join(', '), fields.title), link: notifications.link(challengeId) },
      transaction
    );
  }
}
