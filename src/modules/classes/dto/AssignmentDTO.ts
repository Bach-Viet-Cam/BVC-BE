import type { AssignmentDetailRow, AssignmentRow, StudentSubmissionRow } from '../repository/AssignmentRepository.ts';
import type { StudentAssignmentStatus } from '../service/AssignmentPolicyService.ts';

export interface AssignmentListItem {
  id: string;
  classId: string;
  title: string;
  className: string;
  type: AssignmentRow['type'];
  deadline: string;
  status: StudentAssignmentStatus;
  usedSubmissions: number;
  maxSubmissions: number;
  minAccuracy: number;
  bonusPoints: number | null;
}

export interface StudentSubmissionItem {
  id: string;
  attemptNumber: number;
  status: StudentSubmissionRow['status'];
  accuracy: number | null;
  submittedAt: string;
  comment: { content: string; updatedAt: string } | null;
}

export interface AssignmentDetail extends AssignmentListItem {
  description: string;
  weekNo: number | null;
  targetBpm: number | null;
  pieceId: string | null;
  pieceTitle: string | null;
  rubric: { name: string; weight: number }[];
  canSubmit: boolean;
  hasEnsembleTracks: boolean;
  // Newest attempt first, each with the lecturer comment if any.
  submissions: StudentSubmissionItem[];
}

export default class AssignmentDTO {
  static toListItem(row: AssignmentRow, extra: { status: StudentAssignmentStatus; usedSubmissions: number; minAccuracy: number }): AssignmentListItem {
    return {
      id: row.id,
      classId: row.classId,
      title: row.title,
      className: row.class.name,
      type: row.type,
      deadline: row.deadline.toISOString(),
      status: extra.status,
      usedSubmissions: extra.usedSubmissions,
      maxSubmissions: row.maxSubmissions,
      minAccuracy: extra.minAccuracy,
      bonusPoints: row.bonusPoints
    };
  }

  static toDetail(row: AssignmentDetailRow, listItem: AssignmentListItem, extra: { canSubmit: boolean; hasEnsembleTracks: boolean }): AssignmentDetail {
    return {
      ...listItem,
      description: row.description,
      weekNo: row.weekNo,
      targetBpm: row.targetBpm ?? row.piece?.bpm ?? null,
      pieceId: row.piece?.id ?? null,
      pieceTitle: row.piece?.title ?? null,
      rubric: row.rubric?.criteria ?? [],
      canSubmit: extra.canSubmit,
      hasEnsembleTracks: extra.hasEnsembleTracks,
      submissions: row.submissions.map((submission, index) => AssignmentDTO.toSubmissionItem(submission, index + 1)).reverse()
    };
  }

  static toSubmissionItem(submission: StudentSubmissionRow, attemptNumber: number): StudentSubmissionItem {
    return {
      id: submission.id,
      attemptNumber,
      status: submission.status,
      accuracy: submission.accuracy,
      submittedAt: submission.createdAt.toISOString(),
      comment: submission.comment ? { content: submission.comment.content, updatedAt: submission.comment.updatedAt.toISOString() } : null
    };
  }
}
