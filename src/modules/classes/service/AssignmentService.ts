import AppError from '../../../utils/AppError.ts';
import SystemConfigService from '../../platform/service/SystemConfigService.ts';
import ClassesConstant from '../constant/ClassesConstant.ts';
import AssignmentDTO, { type AssignmentDetail, type AssignmentListItem } from '../dto/AssignmentDTO.ts';
import AssignmentRepository, { type AssignmentRow } from '../repository/AssignmentRepository.ts';
import AssignmentPolicyService, { type StudentAssignmentStatus } from './AssignmentPolicyService.ts';

export interface MyAssignmentsQuery {
  classId?: string;
  status?: StudentAssignmentStatus;
  type?: 'BONUS' | 'NON_BONUS';
  q?: string;
  sortBy: 'deadline' | 'title';
  sortDir: 'asc' | 'desc';
}

export default class AssignmentService {
  static buildListItem(row: AssignmentRow, defaultMinAccuracy: number, now: Date): AssignmentListItem {
    const minAccuracy = row.minAccuracy ?? defaultMinAccuracy;
    const status = AssignmentPolicyService.getStudentStatus({ deadline: row.deadline, now, minAccuracy, submissions: row.submissions });
    return AssignmentDTO.toListItem(row, { status, minAccuracy, usedSubmissions: AssignmentPolicyService.countUsedSubmissions(row.submissions) });
  }

  static async listMine(userId: string, query: MyAssignmentsQuery): Promise<AssignmentListItem[]> {
    const memberships = await AssignmentRepository.findMemberships(userId);
    if (memberships.length === 0) return [];
    const [rows, defaultMinAccuracy] = await Promise.all([
      AssignmentRepository.findPublishedForStudent(userId, memberships.map((item) => item.classId)),
      SystemConfigService.getNumber('min_accuracy_default')
    ]);
    const now = new Date();
    const keyword = query.q?.toLowerCase();
    const items = rows
      .filter((row) => !query.classId || row.classId === query.classId)
      .filter((row) => !query.type || (query.type === 'BONUS') === (row.type === 'BONUS'))
      .filter((row) => !keyword || row.title.toLowerCase().includes(keyword))
      .map((row) => AssignmentService.buildListItem(row, defaultMinAccuracy, now))
      .filter((item) => !query.status || item.status === query.status);
    const direction = query.sortDir === 'asc' ? 1 : -1;
    return items.sort((first, second) => (query.sortBy === 'title' ? first.title.localeCompare(second.title) : first.deadline.localeCompare(second.deadline)) * direction);
  }

  static async getDetail(userId: string, assignmentId: string): Promise<AssignmentDetail> {
    const row = await AssignmentRepository.findDetailForStudent(assignmentId, userId);
    const memberships = await AssignmentRepository.findMemberships(userId);
    const membership = row ? memberships.find((item) => item.classId === row.classId) : undefined;
    if (!row || !row.isPublished || !membership) throw AppError.notFound(ClassesConstant.messages.ASSIGNMENT_NOT_FOUND);
    const defaultMinAccuracy = await SystemConfigService.getNumber('min_accuracy_default');
    const now = new Date();
    const canSubmit = AssignmentPolicyService.canSubmit({ isPublished: row.isPublished, deadline: row.deadline, now, maxSubmissions: row.maxSubmissions, submissions: row.submissions });
    const hasEnsembleTracks = row.piece?.ensembleTracks.some((track) => track.instrumentId !== membership.instrumentId) ?? false;
    return AssignmentDTO.toDetail(row, AssignmentService.buildListItem(row, defaultMinAccuracy, now), { canSubmit, hasEnsembleTracks });
  }
}
