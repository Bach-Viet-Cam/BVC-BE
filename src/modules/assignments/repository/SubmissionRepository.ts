import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AssignmentConstant from '../constant/AssignmentConstant.ts';

// Reads submissions (written by the audio flow) and writes the lecturer comment next to them.
export default class SubmissionRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findActiveMembers(classIds: string[]): Promise<Array<{ classId: string; user: { id: string; username: string; studentCode: string | null } }>> {
    return SubmissionRepository.client.classMember.findMany({
      where: { classId: { in: classIds }, removedAt: null },
      orderBy: { user: { username: 'asc' } },
      select: { classId: true, user: { select: { id: true, username: true, studentCode: true } } }
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
      select: { studentId: true, status: true, accuracy: true, createdAt: true }
    });
    const byStudent = new Map<string, Backend.SubmissionSnapshot[]>();
    for (const row of rows) {
      const snapshots = byStudent.get(row.studentId) ?? [];
      snapshots.push({ status: row.status, accuracy: row.accuracy, submittedAt: row.createdAt });
      byStudent.set(row.studentId, snapshots);
    }
    return byStudent;
  }

  static async findStudentSubmissions(assignmentId: string, studentId: string): Promise<Array<Omit<Backend.StudentSubmissionDTO, 'attemptNumber' | 'submittedAt' | 'comment'> & { submittedAt: Date; comment: { content: string; updatedAt: Date } | null }>> {
    const rows = await SubmissionRepository.client.submission.findMany({
      where: { assignmentId, studentId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        accuracy: true,
        tempoDeviation: true,
        fileUrl: true,
        createdAt: true,
        assignmentVersion: { select: { version: true } },
        comment: { select: { content: true, updatedAt: true } }
      }
    });
    return rows.map((row) => ({
      id: row.id,
      version: row.assignmentVersion?.version ?? 1,
      status: row.status,
      accuracy: row.accuracy,
      tempoDeviation: row.tempoDeviation,
      audioUrl: row.fileUrl ?? '',
      submittedAt: row.createdAt,
      comment: row.comment
    }));
  }

  static async findSubmissionContext(submissionId: string): Promise<{
    id: string;
    studentId: string;
    assignmentId: string;
    comment: { id: string } | null;
    assignment: { deletedAt: Date | null; currentVersion: { title: string } | null; class: { id: string; name: string; status: Backend.ClassStatus; ownerId: string } };
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
            class: { select: { id: true, name: true, status: true, ownerId: true } }
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
    const pieces = await SubmissionRepository.client.piece.findMany({
      where: { instruments: { some: { instrumentId } }, visibility: 'PUBLIC', moderation: 'NORMAL', deletedAt: null },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, kind: true, bpm: true }
    });
    return pieces.map((piece) => ({ id: piece.id, title: piece.title, kind: piece.kind, defaultBpm: piece.bpm }));
  }
}
