import PrismaClientProvider from '../../src/config/PrismaClient.ts';
import AuthService from '../../src/modules/auth/service/AuthService.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';

const ROLES = { STUDENT: 1, TEACHER: 2, SYSTEM_ADMIN: 3 } as const;

// Factories and cleanup for integration tests. Runs only against TEST_DATABASE_URL (see vitest.config.ts).
export default class TestDatabase {
  static readonly roles = ROLES;
  static sequence = 0;

  static get prisma() {
    return PrismaClientProvider.instance;
  }

  static async reset(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (!databaseUrl.includes('test')) throw new Error(`Refusing to truncate a non-test database: ${databaseUrl}`);
    await TestDatabase.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE audit_logs, class_members, student_import_logs, roadmap_week_exercises, roadmap_weeks, classes, roadmaps, pieces, instruments, auth_sessions, auth_identities, users CASCADE'
    );
  }

  static nextId(): number {
    TestDatabase.sequence += 1;
    return TestDatabase.sequence;
  }

  static async createUser(overrides: Partial<{ email: string; username: string; role: number; status: Backend.UserStatus; studentCode: string | null }> = {}) {
    const sequence = TestDatabase.nextId();
    return TestDatabase.prisma.user.create({
      data: {
        email: overrides.email ?? `user${sequence}@fpt.edu.vn`,
        username: overrides.username ?? `Người dùng ${sequence}`,
        role: overrides.role ?? ROLES.STUDENT,
        status: overrides.status ?? 'ACTIVE',
        studentCode: overrides.studentCode === undefined ? null : overrides.studentCode
      }
    });
  }

  static async createLecturer() {
    return TestDatabase.createUser({ role: ROLES.TEACHER });
  }

  static async createInstrument(name: string = `Đàn ${TestDatabase.nextId()}`, isActive: boolean = true) {
    return TestDatabase.prisma.instrument.create({ data: { name, isActive } });
  }

  static async createPiece(instrumentId: string, overrides: Partial<{ title: string; kind: 'FINGER_EXERCISE' | 'SONG'; isVisible: boolean }> = {}) {
    return TestDatabase.prisma.piece.create({
      data: {
        title: overrides.title ?? `Luyện ngón ${TestDatabase.nextId()}`,
        instrumentId,
        kind: overrides.kind ?? 'FINGER_EXERCISE',
        isVisible: overrides.isVisible ?? true
      }
    });
  }

  static async createClass(lecturerId: string, instrumentId: string, overrides: Partial<{ name: string; cohort: string; startDate: string; status: 'ACTIVE' | 'FINISHED' }> = {}) {
    const startDate = overrides.startDate ?? DateTimeUtil.addDays(DateTimeUtil.todayInVietnam(), 7);
    return TestDatabase.prisma.class.create({
      data: {
        name: overrides.name ?? `Lớp ${TestDatabase.nextId()}`,
        cohort: overrides.cohort ?? 'FA26',
        instrumentId,
        lecturerId,
        startDate: DateTimeUtil.toDateOnly(startDate),
        endDate: DateTimeUtil.toDateOnly(DateTimeUtil.addDays(startDate, 42)),
        status: overrides.status ?? 'ACTIVE'
      }
    });
  }

  static async addMember(classId: string, studentId: string, addedById: string) {
    return TestDatabase.prisma.classMember.create({ data: { classId, studentId, addedById, source: 'MANUAL' } });
  }

  static tokenFor(user: { id: string; email: string; username: string; role: number; status: Backend.UserStatus }): string {
    return `Bearer ${AuthService.createAccessToken(user)}`;
  }

  static futureDate(days: number = 7): string {
    return DateTimeUtil.addDays(DateTimeUtil.todayInVietnam(), days);
  }
}
