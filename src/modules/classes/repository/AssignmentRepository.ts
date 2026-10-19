import PrismaClientProvider from '../../../config/PrismaClient.ts';
import type { PieceAvailability } from '../../ensemble/service/EnsemblePolicyService.ts';

export interface SubmissionBrief {
  status: 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  accuracy: number | null;
}

export interface AssignmentRow {
  id: string;
  classId: string;
  title: string;
  type: 'PRACTICE' | 'RHYTHM' | 'RECORDING' | 'SHEET' | 'BONUS' | 'EXAM';
  description: string;
  weekNo: number | null;
  deadline: Date;
  targetBpm: number | null;
  minAccuracy: number | null;
  maxSubmissions: number;
  isPublished: boolean;
  bonusPoints: number | null;
  class: { id: string; name: string };
  submissions: SubmissionBrief[];
}

export interface AssignmentDetailRow extends AssignmentRow {
  piece: (PieceAvailability & { id: string; title: string; bpm: number; ensembleTracks: { instrumentId: string }[] }) | null;
  rubric: { criteria: { name: string; weight: number }[] } | null;
}

export default class AssignmentRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findMemberships(userId: string): Promise<{ classId: string; instrumentId: string }[]> {
    return AssignmentRepository.client.classMember.findMany({ where: { userId }, select: { classId: true, instrumentId: true } });
  }

  static async findPublishedForStudent(userId: string, classIds: string[]): Promise<AssignmentRow[]> {
    return AssignmentRepository.client.assignment.findMany({
      where: { classId: { in: classIds }, isPublished: true },
      include: { class: { select: { id: true, name: true } }, submissions: { where: { studentId: userId }, select: { status: true, accuracy: true } } }
    });
  }

  static async findDetailForStudent(assignmentId: string, userId: string): Promise<AssignmentDetailRow | null> {
    return AssignmentRepository.client.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        class: { select: { id: true, name: true } },
        piece: { select: { id: true, title: true, bpm: true, visibility: true, moderation: true, deletedAt: true, ensembleTracks: { select: { instrumentId: true } } } },
        rubric: { select: { criteria: { select: { name: true, weight: true }, orderBy: { position: 'asc' } } } },
        submissions: { where: { studentId: userId }, select: { status: true, accuracy: true } }
      }
    });
  }
}
