import PrismaClientProvider from '../../../config/PrismaClient.ts';

interface EvaluationRow {
  content: string;
  updatedAt: Date;
  lecturer: { username: string };
}

interface StudentClassRow {
  id: string;
  name: string;
  cohort: string;
  status: Backend.ClassStatus;
  startDate: Date;
}

// Reads for the student stats screens (lecturer view of a student, student view of themself).
export default class StudentStatsRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  static async findStatsAssignments(classId: string): Promise<Backend.StatsAssignmentRow[]> {
    const rows = await StudentStatsRepository.client.assignment.findMany({
      where: { classId, status: { not: 'DRAFT' }, deletedAt: null },
      select: { id: true, title: true, publishedAt: true, currentVersion: { select: { title: true, kind: true } } }
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.currentVersion?.title ?? row.title,
      kind: row.currentVersion?.kind ?? 'OTHER',
      publishedAt: row.publishedAt
    }));
  }

  static async findStatsSubmissions(studentId: string, assignmentIds: string[]): Promise<Backend.StatsSubmissionRow[]> {
    if (assignmentIds.length === 0) return [];
    const rows = await StudentStatsRepository.client.submission.findMany({
      where: { studentId, assignmentId: { in: assignmentIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, assignmentId: true, status: true, accuracy: true, createdAt: true, comment: { select: { id: true } } }
    });
    return rows.map((row) => ({
      id: row.id,
      assignmentId: row.assignmentId as string,
      status: row.status as Backend.SubmissionStatus,
      accuracy: row.accuracy,
      createdAt: row.createdAt,
      hasComment: row.comment !== null
    }));
  }

  // Every class the student has ever been a member of (including ones they left).
  static async findStudentClasses(studentId: string): Promise<StudentClassRow[]> {
    const memberships = await StudentStatsRepository.client.classMember.findMany({
      where: { userId: studentId },
      select: { class: { select: { id: true, name: true, cohort: true, status: true, startDate: true } } }
    });
    const byId = new Map<string, StudentClassRow>();
    for (const membership of memberships) byId.set(membership.class.id, membership.class);
    return [...byId.values()];
  }

  static async hasEverBeenMember(classId: string, studentId: string): Promise<boolean> {
    const count = await StudentStatsRepository.client.classMember.count({ where: { classId, userId: studentId } });
    return count > 0;
  }

  static async findEvaluation(classId: string, studentId: string): Promise<EvaluationRow | null> {
    return StudentStatsRepository.client.studentEvaluation.findUnique({
      where: { classId_studentId: { classId, studentId } },
      select: { content: true, updatedAt: true, lecturer: { select: { username: true } } }
    });
  }

  static async upsertEvaluation(classId: string, studentId: string, lecturerId: string, content: string): Promise<EvaluationRow> {
    return StudentStatsRepository.client.studentEvaluation.upsert({
      where: { classId_studentId: { classId, studentId } },
      create: { classId, studentId, lecturerId, content },
      update: { lecturerId, content },
      select: { content: true, updatedAt: true, lecturer: { select: { username: true } } }
    });
  }
}
