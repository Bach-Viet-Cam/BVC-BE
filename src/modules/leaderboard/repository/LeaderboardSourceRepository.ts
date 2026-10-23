import PrismaClientProvider from '../../../config/PrismaClient.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';

// Read-only queries feeding the leaderboard snapshot: grouped by set, never per student (no N+1).
export default class LeaderboardSourceRepository {
  static get client() {
    return PrismaClientProvider.instance;
  }

  // D2: active members of every class whose cohort is the semester name (ACTIVE and ENDED classes), students only
  static async findSemesterMembers(semesterName: string): Promise<Backend.LeaderboardMemberRecord[]> {
    const members = await LeaderboardSourceRepository.client.classMember.findMany({
      where: { removedAt: null, class: { cohort: semesterName }, user: { role: AuthConstant.roles.STUDENT } },
      select: { classId: true, class: { select: { name: true } }, user: { select: { id: true, username: true, studentCode: true } } }
    });
    return members.map((member) => ({
      studentId: member.user.id,
      username: member.user.username,
      studentCode: member.user.studentCode,
      classId: member.classId,
      className: member.class.name
    }));
  }

  // Every submission (any status) of the assignments not deleted, created in [from, to)
  static async findSubmissions(studentIds: string[], classIds: string[], from: Date, to: Date): Promise<Backend.LeaderboardSubmissionRecord[]> {
    const rows = await LeaderboardSourceRepository.client.submission.findMany({
      where: { studentId: { in: studentIds }, createdAt: { gte: from, lt: to }, assignment: { classId: { in: classIds }, deletedAt: null } },
      select: {
        studentId: true,
        assignmentId: true,
        status: true,
        accuracy: true,
        createdAt: true,
        assignment: { select: { classId: true, status: true, currentVersion: { select: { kind: true } } } }
      }
    });
    // Free-practice submissions have no assignment; the where above already excludes them
    return rows.flatMap((row) => row.assignment && row.assignmentId ? [{
      studentId: row.studentId,
      classId: row.assignment.classId,
      assignmentId: row.assignmentId,
      kind: row.assignment.currentVersion?.kind ?? 'OTHER',
      assignmentStatus: row.assignment.status,
      status: row.status,
      accuracy: row.accuracy,
      submittedAt: row.createdAt
    }] : []);
  }

  static async findEnsembleSessions(studentIds: string[], from: Date, to: Date): Promise<Backend.LeaderboardEnsembleRecord[]> {
    const rows = await LeaderboardSourceRepository.client.ensembleSession.findMany({
      where: { studentId: { in: studentIds }, createdAt: { gte: from, lt: to } },
      select: { studentId: true, status: true, createdAt: true, assignment: { select: { classId: true } } }
    });
    return rows.map((row) => ({ studentId: row.studentId, classId: row.assignment?.classId ?? null, status: row.status, createdAt: row.createdAt }));
  }

  // P1: published or closed, not deleted, not Bonus
  static async findCountedAssignments(classIds: string[]): Promise<Backend.LeaderboardAssignmentRecord[]> {
    const rows = await LeaderboardSourceRepository.client.assignment.findMany({
      where: { classId: { in: classIds }, status: { in: ['PUBLISHED', 'CLOSED'] }, deletedAt: null, currentVersion: { kind: { not: 'BONUS' } } },
      select: { id: true, classId: true }
    });
    return rows.map((row) => ({ ...row, bonusPoints: null }));
  }

  static async findBonusAssignments(classIds: string[]): Promise<Backend.LeaderboardAssignmentRecord[]> {
    const rows = await LeaderboardSourceRepository.client.assignment.findMany({
      where: { classId: { in: classIds }, status: { in: ['PUBLISHED', 'CLOSED'] }, deletedAt: null, currentVersion: { kind: 'BONUS' } },
      select: { id: true, classId: true, bonusPoints: true }
    });
    return rows;
  }
}
