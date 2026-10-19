import PrismaClientProvider from '../../../config/PrismaClient.ts';

export interface ClassSummaryRecord {
  id: string;
  name: string;
  ownerId: string;
}

export interface ProgressMemberRecord {
  userId: string;
  username: string;
  studentCode: string | null;
}

export default class ProgressRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findClassesByOwner(ownerId: string): Promise<ClassSummaryRecord[]> {
    return ProgressRepository.client.class.findMany({
      where: { ownerId, status: 'ACTIVE' },
      select: { id: true, name: true, ownerId: true },
      orderBy: { name: 'asc' }
    });
  }

  static async findClassById(classId: string): Promise<ClassSummaryRecord | null> {
    return ProgressRepository.client.class.findUnique({ where: { id: classId }, select: { id: true, name: true, ownerId: true } });
  }

  static async findMembers(classId: string): Promise<ProgressMemberRecord[]> {
    const members = await ProgressRepository.client.classMember.findMany({
      where: { classId },
      select: { user: { select: { id: true, username: true, studentCode: true } } }
    });
    return members.map((member) => ({ userId: member.user.id, username: member.user.username, studentCode: member.user.studentCode }));
  }

  static async findAnalysedAccuracies(classId: string, studentIds: string[]): Promise<{ studentId: string; accuracy: number }[]> {
    const rows = await ProgressRepository.client.submission.findMany({
      where: {
        studentId: { in: studentIds },
        status: 'COMPLETED',
        accuracy: { not: null },
        assignment: { classId, type: { not: 'BONUS' } }
      },
      select: { studentId: true, accuracy: true }
    });
    return rows.flatMap((row) => (row.accuracy === null ? [] : [{ studentId: row.studentId, accuracy: row.accuracy }]));
  }
}
