import AppError from '../../../utils/AppError.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import ClassesConstant from '../constant/ClassesConstant.ts';
import ProgressDTO, { type ProgressItem, type ProgressResult } from '../dto/ProgressDTO.ts';
import ProgressRepository, { type ClassSummaryRecord } from '../repository/ProgressRepository.ts';
import ProgressPolicyService, { type ProgressStatus } from './ProgressPolicyService.ts';

export interface ProgressQuery {
  status?: ProgressStatus;
  q?: string;
  sortBy: 'studentCode' | 'username' | 'averageAccuracy';
  sortDir: 'asc' | 'desc';
}

export default class ProgressService {
  static async listOwnedClasses(ownerId: string): Promise<{ id: string; name: string }[]> {
    const classes = await ProgressRepository.findClassesByOwner(ownerId);
    return classes.map((item) => ({ id: item.id, name: item.name }));
  }

  static async getOwnedClassOrThrow(classId: string, teacherId: string): Promise<ClassSummaryRecord> {
    const classRecord = await ProgressRepository.findClassById(classId);
    if (!classRecord) throw AppError.notFound(ClassesConstant.messages.CLASS_NOT_FOUND);
    if (classRecord.ownerId !== teacherId) throw AppError.forbidden(ClassesConstant.messages.CLASS_FORBIDDEN);
    return classRecord;
  }

  static async getClassProgress(classId: string, teacherId: string, query: ProgressQuery): Promise<ProgressResult> {
    await ProgressService.getOwnedClassOrThrow(classId, teacherId);
    const [minAccuracy, atRiskMargin, members] = await Promise.all([
      SystemConfigService.getNumber('min_accuracy_default'),
      SystemConfigService.getNumber('at_risk_margin'),
      ProgressRepository.findMembers(classId)
    ]);
    const accuracies = await ProgressRepository.findAnalysedAccuracies(classId, members.map((member) => member.userId));
    const allItems: ProgressItem[] = members.map((member) => {
      const own = accuracies.filter((row) => row.studentId === member.userId).map((row) => row.accuracy);
      const averageAccuracy = ProgressPolicyService.average(own);
      return { ...member, submissionCount: own.length, averageAccuracy, status: ProgressPolicyService.getStatus({ averageAccuracy, minAccuracy, atRiskMargin }) };
    });
    return ProgressDTO.toResult(ProgressService.filterAndSort(allItems, query), allItems);
  }

  static filterAndSort(items: ProgressItem[], query: ProgressQuery): ProgressItem[] {
    const keyword = query.q?.toLowerCase();
    const filtered = items.filter((item) => {
      if (query.status && item.status !== query.status) return false;
      if (!keyword) return true;
      return item.username.toLowerCase().includes(keyword) || (item.studentCode ?? '').toLowerCase().includes(keyword);
    });
    const direction = query.sortDir === 'asc' ? 1 : -1;
    return filtered.sort((first, second) => {
      if (query.sortBy === 'averageAccuracy') {
        if (first.averageAccuracy === null) return 1;
        if (second.averageAccuracy === null) return -1;
        return (first.averageAccuracy - second.averageAccuracy) * direction;
      }
      return (first[query.sortBy] ?? '').localeCompare(second[query.sortBy] ?? '') * direction;
    });
  }
}
