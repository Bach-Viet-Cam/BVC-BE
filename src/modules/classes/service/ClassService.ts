import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassDTO from '../dto/ClassDTO.ts';
import AssignmentService from '../../assignments/service/AssignmentService.ts';
import AssignmentRepository from '../../assignments/repository/AssignmentRepository.ts';
import RoadmapRepository from '../../roadmaps/repository/RoadmapRepository.ts';
import ClassRepository from '../repository/ClassRepository.ts';
import ClassAccessService from './ClassAccessService.ts';

const messages = ClassConstant.messages;
const auditActions = ClassConstant.auditActions;

// UC-09 Manage Classes (FR-M03.01.01).
export default class ClassService {
  static async listOwnClasses(lecturerId: string, query: Backend.ClassListQuery): Promise<Backend.ClassListResult> {
    const [{ classes, total }, activeCount, cohorts] = await Promise.all([
      ClassRepository.findClasses(lecturerId, query),
      ClassRepository.countActiveClasses(lecturerId),
      ClassRepository.findCohorts(lecturerId)
    ]);
    return {
      items: classes.map(ClassDTO.toClassSummaryDTO),
      pagination: { page: query.page, limit: query.limit, total },
      activeCount,
      cohorts
    };
  }

  static async getClassDetail(classId: string, lecturerId: string): Promise<Backend.ClassDetailDTO> {
    const classRecord = await ClassAccessService.assertOwnedClass(classId, lecturerId);
    return ClassDTO.toClassDetailDTO(classRecord);
  }

  static calculateEndDate(startDate: string): string {
    return DateTimeUtil.addDays(startDate, ClassConstant.classDurationDays);
  }

  static async createClass(lecturerId: string, input: Backend.CreateClassInput, now: Date = new Date()): Promise<Backend.ClassDetailDTO> {
    ClassService.assertStartDateNotInPast(input.startDate, now);
    await ClassService.assertInstrumentActive(input.instrumentId);
    await ClassService.assertUniqueName(input.cohort, input.name);

    const classData: Backend.ClassWriteData = {
      name: input.name,
      cohort: input.cohort,
      instrumentId: input.instrumentId,
      description: input.description || null,
      startDate: DateTimeUtil.toDateOnly(input.startDate),
      endDate: DateTimeUtil.toDateOnly(ClassService.calculateEndDate(input.startDate)),
      // UC-11: a new class is bound to the latest roadmap version of its instrument (null until one exists).
      roadmapId: await RoadmapRepository.findLatestRoadmapId(input.instrumentId)
    };
    const createdClass = await ClassService.runUniqueGuarded(() =>
      PrismaClientProvider.instance.$transaction(async (transaction) => {
        const classRecord = await ClassRepository.createClass(lecturerId, classData, transaction);
        await AuditLogger.record({
          actorId: lecturerId,
          action: auditActions.CLASS_CREATE,
          entityType: ClassConstant.auditEntityTypes.CLASS,
          entityId: classRecord.id,
          payload: { name: classRecord.name, cohort: classRecord.cohort, instrumentId: classRecord.instrumentId, startDate: input.startDate }
        }, transaction);
        return classRecord;
      })
    );
    return ClassDTO.toClassDetailDTO(createdClass, now);
  }

  static async updateClass(classId: string, lecturerId: string, input: Backend.UpdateClassInput, now: Date = new Date()): Promise<Backend.ClassDetailDTO> {
    const currentClass = await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });
    const changes = await ClassService.buildClassChanges(currentClass, input, now);
    if (Object.keys(changes).length === 0) return ClassDTO.toClassDetailDTO(currentClass, now);

    const updatedClass = await ClassService.runUniqueGuarded(() =>
      PrismaClientProvider.instance.$transaction(async (transaction) => {
        const classRecord = await ClassRepository.updateClass(classId, changes, transaction);
        if (changes.endDate) await AssignmentRepository.syncDeadlines(classId, changes.endDate, transaction);
        await AuditLogger.record({
          actorId: lecturerId,
          action: auditActions.CLASS_UPDATE,
          entityType: ClassConstant.auditEntityTypes.CLASS,
          entityId: classId,
          payload: { changedFields: Object.keys(changes) }
        }, transaction);
        return classRecord;
      })
    );
    return ClassDTO.toClassDetailDTO(updatedClass, now);
  }

  static async buildClassChanges(
    currentClass: Backend.ClassRecord,
    input: Backend.UpdateClassInput,
    now: Date
  ): Promise<Partial<Backend.ClassWriteData>> {
    const currentStartDate = DateTimeUtil.toIsoDate(currentClass.startDate);
    const hasStarted = DateTimeUtil.hasStarted(currentStartDate, now);
    const changes: Partial<Backend.ClassWriteData> = {};

    if (input.instrumentId !== undefined && input.instrumentId !== currentClass.instrumentId) {
      if (hasStarted) throw AppError.fieldError(409, { field: 'instrumentId', code: 'MSG-08', message: messages.INSTRUMENT_LOCKED });
      await ClassService.assertInstrumentActive(input.instrumentId);
      changes.instrumentId = input.instrumentId;
      // Q6: the roadmap belongs to the instrument, so re-pin to the new instrument's latest version.
      changes.roadmapId = await RoadmapRepository.findLatestRoadmapId(input.instrumentId);
    }
    if (input.startDate !== undefined && input.startDate !== currentStartDate) {
      if (hasStarted) throw AppError.fieldError(409, { field: 'startDate', code: 'MSG-08', message: messages.START_DATE_LOCKED });
      ClassService.assertStartDateNotInPast(input.startDate, now);
      changes.startDate = DateTimeUtil.toDateOnly(input.startDate);
      changes.endDate = DateTimeUtil.toDateOnly(ClassService.calculateEndDate(input.startDate));
    }

    const nextName = input.name ?? currentClass.name;
    const nextCohort = input.cohort ?? currentClass.cohort;
    if (nextName !== currentClass.name || nextCohort !== currentClass.cohort) {
      await ClassService.assertUniqueName(nextCohort, nextName, currentClass.id);
      changes.name = nextName;
      changes.cohort = nextCohort;
    }
    if (input.description !== undefined && (input.description || null) !== currentClass.description) {
      changes.description = input.description || null;
    }
    return changes;
  }

  static async endClass(classId: string, lecturerId: string): Promise<Backend.ClassDetailDTO> {
    await ClassAccessService.assertOwnedClass(classId, lecturerId, { requireActive: true });
    const endedClass = await PrismaClientProvider.instance.$transaction(async (transaction) => {
      const classRecord = await ClassRepository.markClassFinished(classId, new Date(), transaction);
      // A17 (user decision 16/10): a finished class closes its published assignments.
      await AssignmentService.closePublishedForClass(classId, transaction);
      await AuditLogger.record({
        actorId: lecturerId,
        action: auditActions.CLASS_END,
        entityType: ClassConstant.auditEntityTypes.CLASS,
        entityId: classId
      }, transaction);
      return classRecord;
    });
    return ClassDTO.toClassDetailDTO(endedClass);
  }

  static assertStartDateNotInPast(startDate: string, now: Date): void {
    if (DateTimeUtil.isBeforeToday(startDate, now)) {
      throw AppError.fieldError(400, { field: 'startDate', message: messages.START_DATE_IN_PAST });
    }
  }

  static async assertInstrumentActive(instrumentId: string): Promise<void> {
    const instrument = await ClassRepository.findInstrumentById(instrumentId);
    if (!instrument || !instrument.isActive) {
      throw AppError.fieldError(400, { field: 'instrumentId', message: messages.INSTRUMENT_UNAVAILABLE });
    }
  }

  static async assertUniqueName(cohort: string, name: string, excludedClassId?: string): Promise<void> {
    const duplicateClass = await ClassRepository.findClassByCohortAndName(cohort, name, excludedClassId);
    if (duplicateClass) throw ClassService.duplicateNameError();
  }

  static duplicateNameError(): AppError {
    return AppError.fieldError(409, { field: 'name', code: 'MSG-05', message: messages.DUPLICATE_CLASS_NAME });
  }

  // DBR-02 is also enforced by a unique index; a concurrent insert surfaces as P2002.
  static async runUniqueGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (ClassAccessService.isUniqueViolation(error)) throw ClassService.duplicateNameError();
      throw error;
    }
  }
}
