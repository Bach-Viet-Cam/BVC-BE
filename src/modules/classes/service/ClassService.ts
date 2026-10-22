import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuditLogger from '../../../lib/AuditLogger.ts';
import AppError from '../../../utils/AppError.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import ClassConstant from '../constant/ClassConstant.ts';
import ClassDTO from '../dto/ClassDTO.ts';
import AssignmentService from '../../assignments/service/AssignmentService.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
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

  static async listSemesters(now: Date = new Date()): Promise<Backend.SemesterListDTO> {
    const semesters = await SystemConfigService.getSemesters();
    return { items: semesters, defaultName: ClassService.pickDefaultSemester(semesters, now)?.name ?? null };
  }

  // The semester containing today; otherwise the one whose end date is closest to today.
  static pickDefaultSemester(semesters: Backend.Semester[], now: Date = new Date()): Backend.Semester | null {
    const today = DateTimeUtil.todayInVietnam(now);
    const current = semesters.find((semester) => semester.startDate <= today && today <= semester.endDate);
    if (current) return current;
    const distanceToToday = (semester: Backend.Semester): number =>
      Math.abs(DateTimeUtil.toDateOnly(semester.endDate).getTime() - DateTimeUtil.toDateOnly(today).getTime());
    return semesters.reduce<Backend.Semester | null>(
      (closest, semester) => (!closest || distanceToToday(semester) < distanceToToday(closest) ? semester : closest),
      null
    );
  }

  // The class runs exactly over its semester: start and end dates are copied from the semester config.
  static async findSemester(name: string): Promise<Backend.Semester> {
    const semesters = await SystemConfigService.getSemesters();
    const semester = semesters.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
    if (!semester) throw AppError.fieldError(400, { field: 'cohort', message: messages.SEMESTER_NOT_FOUND });
    return semester;
  }

  static async createClass(lecturerId: string, input: Backend.CreateClassInput, now: Date = new Date()): Promise<Backend.ClassDetailDTO> {
    const semester = await ClassService.findSemester(input.cohort);
    await ClassService.assertInstrumentActive(input.instrumentId);
    await ClassService.assertUniqueName(semester.name, input.name);

    const classData: Backend.ClassWriteData = {
      name: input.name,
      cohort: semester.name,
      instrumentId: input.instrumentId,
      description: input.description || null,
      startDate: DateTimeUtil.toDateOnly(semester.startDate),
      endDate: DateTimeUtil.toDateOnly(semester.endDate),
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
          payload: { name: classRecord.name, cohort: classRecord.cohort, instrumentId: classRecord.instrumentId, startDate: semester.startDate }
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
    let nextCohort = currentClass.cohort;
    if (input.cohort !== undefined && input.cohort.trim().toLowerCase() !== currentClass.cohort.toLowerCase()) {
      if (hasStarted) throw AppError.fieldError(409, { field: 'cohort', code: 'MSG-08', message: messages.SEMESTER_LOCKED });
      const semester = await ClassService.findSemester(input.cohort);
      nextCohort = semester.name;
      changes.startDate = DateTimeUtil.toDateOnly(semester.startDate);
      changes.endDate = DateTimeUtil.toDateOnly(semester.endDate);
    }

    const nextName = input.name ?? currentClass.name;
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
