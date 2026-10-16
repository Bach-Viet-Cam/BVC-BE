import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';

const toNumber = (value: Prisma.Decimal | null): number | null => (value === null ? null : Number(value));

// TODO(M01): reads (and, for comments, writes next to) the minimal submissions table that M01 will fill.
export default class SubmissionRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findActiveMembers(classIds: string[]): Promise<Array<{ classId: string; student: { id: string; username: string; studentCode: string | null } }>> {
    return SubmissionRepository.client.classMember.findMany({
      where: { classId: { in: classIds }, removedAt: null },
      orderBy: { student: { username: 'asc' } },
      select: { classId: true, student: { select: { id: true, username: true, studentCode: true } } }
    });
  }

  static async findStudentProfile(studentId: string): Promise<{ id: string; username: string; studentCode: string | null } | null> {
    return SubmissionRepository.client.user.findUnique({ where: { id: studentId }, select: { id: true, username: true, studentCode: true } });
  }

  static async findCountedSubmitters(assignmentIds: string[]): Promise<Array<{ assignmentId: string; studentId: string }>> {
    if (assignmentIds.length === 0) return [];
    return SubmissionRepository.client.submission.findMany({
      where: { assignmentId: { in: assignmentIds }, status: { notIn: [...AssignmentConstant.uncountedSubmissionStatuses] } },
      distinct: ['assignmentId', 'studentId'],
      select: { assignmentId: true, studentId: true }
    });
  }

  static async findSnapshotsByStudent(assignmentId: string): Promise<Map<string, Backend.SubmissionSnapshot[]>> {
    const rows = await SubmissionRepository.client.submission.findMany({
      where: { assignmentId },
      select: { studentId: true, status: true, accuracy: true, submittedAt: true }
    });
    const byStudent = new Map<string, Backend.SubmissionSnapshot[]>();
    for (const row of rows) {
      const snapshots = byStudent.get(row.studentId) ?? [];
      snapshots.push({ status: row.status, accuracy: toNumber(row.accuracy), submittedAt: row.submittedAt });
      byStudent.set(row.studentId, snapshots);
    }
    return byStudent;
  }

  static async findStudentSubmissions(assignmentId: string, studentId: string): Promise<Array<Omit<Backend.StudentSubmissionDTO, 'attemptNumber' | 'submittedAt' | 'comment'> & { submittedAt: Date; comment: { content: string; updatedAt: Date } | null }>> {
    const rows = await SubmissionRepository.client.submission.findMany({
      where: { assignmentId, studentId },
      orderBy: { submittedAt: 'asc' },
      select: {
        id: true,
        status: true,
        accuracy: true,
        tempoDeviation: true,
        audioUrl: true,
        submittedAt: true,
        assignmentVersion: { select: { version: true } },
        comment: { select: { content: true, updatedAt: true } }
      }
    });
    return rows.map((row) => ({
      id: row.id,
      version: row.assignmentVersion.version,
      status: row.status,
      accuracy: toNumber(row.accuracy),
      tempoDeviation: toNumber(row.tempoDeviation),
      audioUrl: row.audioUrl,
      submittedAt: row.submittedAt,
      comment: row.comment
    }));
  }

  static async findSubmissionContext(submissionId: string): Promise<{
    id: string;
    studentId: string;
    assignmentId: string;
    comment: { id: string } | null;
    assignment: { deletedAt: Date | null; currentVersion: { title: string } | null; class: { id: string; name: string; status: Backend.ClassStatus; lecturerId: string } };
  } | null> {
    return SubmissionRepository.client.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        studentId: true,
        assignmentId: true,
        comment: { select: { id: true } },
        assignment: {
          select: {
            deletedAt: true,
            currentVersion: { select: { title: true } },
            class: { select: { id: true, name: true, status: true, lecturerId: true } }
          }
        }
      }
    });
  }

  static async upsertComment(submissionId: string, lecturerId: string, content: string, client: Prisma.TransactionClient): Promise<{ content: string; updatedAt: Date }> {
    return client.submissionComment.upsert({
      where: { submissionId },
      create: { submissionId, lecturerId, content },
      update: { content, lecturerId },
      select: { content: true, updatedAt: true }
    });
  }

  static async findClassPieces(instrumentId: string): Promise<Backend.ClassPieceDTO[]> {
    return SubmissionRepository.client.piece.findMany({
      where: { instrumentId, isVisible: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, kind: true, defaultBpm: true }
    });
  }
}
