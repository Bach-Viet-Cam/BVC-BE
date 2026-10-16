import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AppError from '../../../utils/AppError.ts';
import DateTimeUtil from '../../../utils/DateTimeUtil.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import ClassConstant from '../../classes/constant/ClassConstant.ts';
import ClassRepository from '../../classes/repository/ClassRepository.ts';
import MemberRepository from '../../classes/repository/MemberRepository.ts';
import ClassAccessService from '../../classes/service/ClassAccessService.ts';
import RoadmapConstant from '../constant/RoadmapConstant.ts';
import RoadmapDTO from '../dto/RoadmapDTO.ts';
import RoadmapRepository from '../repository/RoadmapRepository.ts';
import RoadmapValidator from './RoadmapValidator.ts';
import RoadmapWeekCalculator from './RoadmapWeekCalculator.ts';

const messages = RoadmapConstant.messages;

// UC-11: per-instrument roadmap managed by the System Admin; every save is a new immutable version.
export default class RoadmapService {
  static async listInstruments(): Promise<Backend.AdminRoadmapListItemDTO[]> {
    const instruments = await RoadmapRepository.findActiveInstrumentsWithLatestVersion();
    return instruments.map(RoadmapDTO.toListItemDTO);
  }

  static async getEditableRoadmap(instrumentId: string): Promise<Backend.RoadmapVersionDTO> {
    const instrument = await RoadmapService.assertActiveInstrument(instrumentId);
    const roadmap = await RoadmapRepository.findLatestRoadmap(instrumentId);
    return roadmap ? RoadmapDTO.toVersionDTO(roadmap) : RoadmapDTO.toTemplateDTO(instrument);
  }

  static async listFingerExercises(instrumentId: string, query?: string): Promise<Backend.FingerExerciseDTO[]> {
    await RoadmapService.assertActiveInstrument(instrumentId);
    return RoadmapRepository.findFingerExercises(instrumentId, query);
  }

  static async saveVersion(instrumentId: string, adminId: string, weeks: Backend.RoadmapWeekInput[]): Promise<Backend.RoadmapVersionDTO> {
    await RoadmapService.assertActiveInstrument(instrumentId);
    const normalizedWeeks = RoadmapValidator.normalizeWeeks(weeks);
    const pieces = await RoadmapRepository.findPiecesByIds([...new Set(normalizedWeeks.flatMap((week) => week.exerciseIds))]);
    const fieldErrors = RoadmapValidator.validateWeeks(normalizedWeeks, new Map(pieces.map((piece) => [piece.id, piece])), instrumentId);
    if (fieldErrors.length > 0) throw AppError.badRequest(messages.INVALID_DATA, { fieldErrors });

    try {
      const roadmap = await PrismaClientProvider.instance.$transaction(async (transaction) => {
        const version = (await RoadmapRepository.findMaxVersion(instrumentId, transaction)) + 1;
        const created = await RoadmapRepository.createRoadmapVersion({ instrumentId, version, createdById: adminId, weeks: normalizedWeeks }, transaction);
        await RoadmapRepository.backfillActiveClasses(instrumentId, created.id, transaction);
        return RoadmapRepository.findRoadmapById(created.id, transaction);
      });
      return RoadmapDTO.toVersionDTO(roadmap as Backend.RoadmapRecord);
    } catch (error) {
      if (RoadmapService.isUniqueViolation(error)) throw AppError.conflict(messages.VERSION_CONFLICT);
      throw error;
    }
  }

  // Read-only roadmap tab: the owning lecturer or a student with an active membership (spec §4.4).
  static async getClassRoadmap(classId: string, viewer: Backend.UserDTO, now: Date = new Date()): Promise<Backend.ClassRoadmapDTO> {
    const classRecord = await RoadmapService.assertCanViewClass(classId, viewer);
    if (!classRecord.roadmapId) return { roadmap: null };
    const roadmap = await RoadmapRepository.findRoadmapById(classRecord.roadmapId);
    if (!roadmap) return { roadmap: null };

    const classStartDate = DateTimeUtil.toIsoDate(classRecord.startDate);
    const today = DateTimeUtil.todayInVietnam(now);
    const weeks = RoadmapDTO.toWeekDTOs(roadmap).map((week) => {
      const window = RoadmapWeekCalculator.buildWeekWindow(classStartDate, week.weekNumber);
      return { ...week, ...window, status: RoadmapWeekCalculator.resolveStatus(window, today), assignments: [] as [] };
    });
    return { roadmap: { id: roadmap.id, version: roadmap.version, weeks } };
  }

  static async assertCanViewClass(classId: string, viewer: Backend.UserDTO): Promise<Backend.ClassRecord> {
    if (viewer.role === AuthConstant.roles.TEACHER) return ClassAccessService.assertOwnedClass(classId, viewer.userId);
    const classRecord = await ClassRepository.findClassById(classId);
    const membership = classRecord ? await MemberRepository.findActiveMembership(classId, viewer.userId) : null;
    if (!classRecord || !membership) throw AppError.notFound(ClassConstant.messages.CLASS_NOT_FOUND);
    return classRecord;
  }

  static async assertActiveInstrument(instrumentId: string): Promise<{ id: string; name: string }> {
    const instrument = await RoadmapRepository.findActiveInstrument(instrumentId);
    if (!instrument) throw AppError.notFound(messages.INSTRUMENT_NOT_FOUND);
    return instrument;
  }

  static isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
