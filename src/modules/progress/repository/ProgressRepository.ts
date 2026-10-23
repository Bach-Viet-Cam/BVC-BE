import type { Prisma } from '@prisma/client';
import PrismaClientProvider from '../../../config/PrismaClient.ts';

// P1: assignments that count towards progress — published or closed, not deleted, not Bonus.
const countedAssignment: Prisma.AssignmentWhereInput = {
  status: { in: ['PUBLISHED', 'CLOSED'] },
  deletedAt: null,
  currentVersion: { kind: { not: 'BONUS' } }
};

export default class ProgressRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findActiveMembers(classId: string): Promise<Array<{ id: string; username: string; studentCode: string | null }>> {
    const members = await ProgressRepository.client.classMember.findMany({
      where: { classId, removedAt: null },
      orderBy: { user: { username: 'asc' } },
      select: { user: { select: { id: true, username: true, studentCode: true } } }
    });
    return members.map((member) => member.user);
  }

  static async findCountedSubmissions(classId: string, studentIds?: string[]): Promise<Backend.CountedSubmissionRow[]> {
    const rows = await ProgressRepository.client.submission.findMany({
      where: { ...(studentIds ? { studentId: { in: studentIds } } : {}), assignment: { ...countedAssignment, classId } },
      select: { studentId: true, assignmentId: true, status: true, accuracy: true, createdAt: true }
    });
    // Free-practice submissions have no assignment; the where above already excludes them
    return rows.flatMap(({ createdAt, assignmentId, ...row }) => assignmentId ? [{ ...row, assignmentId, submittedAt: createdAt }] : []);
  }

  static async findClassSubmissions(
    classId: string,
    studentId: string,
    range: { from?: Date; to?: Date },
    paging: { skip: number; take: number }
  ): Promise<{ rows: Array<{ id: string; assignmentId: string; title: string; kind: Backend.AssignmentKind; status: Backend.SubmissionStatus; accuracy: number | null; submittedAt: Date }>; total: number }> {
    const where: Prisma.SubmissionWhereInput = {
      studentId,
      assignment: { classId, deletedAt: null },
      ...(range.from || range.to ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {})
    };
    const [rows, total] = await ProgressRepository.client.$transaction([
      ProgressRepository.client.submission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          assignmentId: true,
          status: true,
          accuracy: true,
          createdAt: true,
          assignment: { select: { currentVersion: { select: { title: true, kind: true } } } }
        }
      }),
      ProgressRepository.client.submission.count({ where })
    ]);
    return {
      rows: rows.flatMap((row) => row.assignment && row.assignmentId ? [{
        id: row.id,
        assignmentId: row.assignmentId,
        title: row.assignment.currentVersion?.title ?? '',
        kind: row.assignment.currentVersion?.kind ?? 'OTHER',
        status: row.status,
        accuracy: row.accuracy,
        submittedAt: row.createdAt
      }] : []),
      total
    };
  }

  // P5: every submission in the class (rejected / failed / Bonus included), except those of deleted assignments.
  static async countSessions(classId: string, studentId: string, since?: Date): Promise<number> {
    return ProgressRepository.client.submission.count({
      where: { studentId, assignment: { classId, deletedAt: null }, ...(since ? { createdAt: { gte: since } } : {}) }
    });
  }

  static async hasAnySubmission(classId: string, studentId: string): Promise<boolean> {
    return (await ProgressRepository.client.submission.count({ where: { studentId, assignment: { classId } } })) > 0;
  }

  static async findStudent(studentId: string): Promise<{ id: string; username: string; studentCode: string | null } | null> {
    return ProgressRepository.client.user.findUnique({ where: { id: studentId }, select: { id: true, username: true, studentCode: true } });
  }
}
