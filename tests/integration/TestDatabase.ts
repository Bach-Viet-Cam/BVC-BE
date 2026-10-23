import PrismaClientProvider from '../../src/config/PrismaClient.ts';
import AuthService from '../../src/modules/auth/service/AuthService.ts';
import AssignmentRepository from '../../src/modules/assignments/repository/AssignmentRepository.ts';
import PlatformConstant from '../../src/modules/platform/constant/PlatformConstant.ts';
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
    const tables = await TestDatabase.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '%prisma%'
    `;
    const tableList = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
    await TestDatabase.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE`);
    await TestDatabase.resetGradingSettings();
    await TestDatabase.resetSemesters();
  }

  // Default semesters relative to today: SP26 already ended, FA26 starts in 3 days, SP27 later.
  static defaultSemesters(): Backend.Semester[] {
    return [
      { name: 'SP26', startDate: TestDatabase.futureDate(-200), endDate: TestDatabase.futureDate(-100) },
      { name: 'FA26', startDate: TestDatabase.futureDate(3), endDate: TestDatabase.futureDate(90) },
      { name: 'SP27', startDate: TestDatabase.futureDate(120), endDate: TestDatabase.futureDate(210) }
    ];
  }

  static async resetSemesters(semesters: Backend.Semester[] = TestDatabase.defaultSemesters()): Promise<void> {
    const key = PlatformConstant.settingKeys.SEMESTERS;
    const { group, valueType, label } = PlatformConstant.semesterConfig;
    const value = JSON.stringify(semesters);
    await TestDatabase.prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value, valueType, group, label } });
  }

  // Grading thresholds live in system_configs (SCORING group); there is no code fallback.
  static async resetGradingSettings(minAccuracy: number = 70, atRiskMargin: number = 40): Promise<void> {
    const { MIN_ACCURACY, AT_RISK_MARGIN } = PlatformConstant.settingKeys;
    const { group, valueType, label } = PlatformConstant.atRiskMarginConfig;
    for (const [key, value] of [[MIN_ACCURACY, minAccuracy], [AT_RISK_MARGIN, atRiskMargin]] as const) {
      await TestDatabase.prisma.systemConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value), valueType, group, label: `${label} ${key}` }
      });
    }
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
    return TestDatabase.prisma.instrument.create({ data: { name, code: `INS_${TestDatabase.nextId()}_${Date.now()}`, isActive } });
  }

  static async createPiece(instrumentId: string, overrides: Partial<{ title: string; kind: 'FINGER_EXERCISE' | 'SONG'; isVisible: boolean; bpm: number }> = {}) {
    const owner = await TestDatabase.createUser({ role: ROLES.SYSTEM_ADMIN });
    const genre = await TestDatabase.prisma.category.upsert({ where: { type_name: { type: 'GENRE', name: 'Thể loại test' } }, update: {}, create: { type: 'GENRE', name: 'Thể loại test' } });
    const level = await TestDatabase.prisma.category.upsert({ where: { type_name: { type: 'LEVEL', name: 'Trình độ test' } }, update: {}, create: { type: 'LEVEL', name: 'Trình độ test' } });
    return TestDatabase.prisma.piece.create({
      data: {
        title: overrides.title ?? `Luyện ngón ${TestDatabase.nextId()}`,
        ownerId: owner.id,
        genreId: genre.id,
        levelId: level.id,
        kind: overrides.kind ?? 'FINGER_EXERCISE',
        bpm: overrides.bpm ?? 90,
        visibility: (overrides.isVisible ?? true) ? 'PUBLIC' : 'HIDDEN',
        instruments: { create: [{ instrumentId }] }
      }
    });
  }

  static async createSheetMusic(pieceId: string, instrumentId: string, overrides: Partial<{ name: string; visibility: 'PUBLIC' | 'HIDDEN' }> = {}) {
    const uploader = await TestDatabase.createUser({ role: ROLES.SYSTEM_ADMIN });
    const level = await TestDatabase.prisma.category.upsert({ where: { type_name: { type: 'LEVEL', name: 'Trình độ test' } }, update: {}, create: { type: 'LEVEL', name: 'Trình độ test' } });
    const sheetFile = await TestDatabase.prisma.mediaFile.create({
      data: { kind: 'SHEET', status: 'READY', storageKey: `test/${TestDatabase.nextId()}-sheet.pdf`, originalName: 'sheet.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedById: uploader.id }
    });
    return TestDatabase.prisma.sheetMusic.create({
      data: {
        pieceId,
        instrumentId,
        kind: 'LEVEL',
        name: overrides.name ?? `Bản nhạc ${TestDatabase.nextId()}`,
        levelId: level.id,
        sheetFileId: sheetFile.id,
        visibility: overrides.visibility ?? 'PUBLIC',
        uploaderId: uploader.id
      }
    });
  }

  static async createClass(lecturerId: string, instrumentId: string, overrides: Partial<{ name: string; cohort: string; startDate: string; status: 'ACTIVE' | 'ENDED' }> = {}) {
    const startDate = overrides.startDate ?? DateTimeUtil.addDays(DateTimeUtil.todayInVietnam(), 7);
    return TestDatabase.prisma.class.create({
      data: {
        name: overrides.name ?? `Lớp ${TestDatabase.nextId()}`,
        cohort: overrides.cohort ?? 'FA26',
        instrumentId,
        ownerId: lecturerId,
        startDate: DateTimeUtil.toDateOnly(startDate),
        endDate: DateTimeUtil.toDateOnly(DateTimeUtil.addDays(startDate, 42)),
        status: overrides.status ?? 'ACTIVE'
      }
    });
  }

  static async createAssignment(
    classId: string,
    lecturerId: string,
    overrides: Partial<{ title: string; kind: 'SOLO' | 'ENSEMBLE' | 'BONUS' | 'OTHER'; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; sheetMusicId: string | null; requiredBpm: number | null; deletedAt: Date | null }> = {}
  ) {
    const classRecord = await TestDatabase.prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { endDate: true } });
    const status = overrides.status ?? 'PUBLISHED';
    const content = {
      title: overrides.title ?? `Bài tập ${TestDatabase.nextId()}`,
      kind: overrides.kind ?? 'SOLO',
      sheetMusicId: overrides.sheetMusicId ?? null,
      requiredBpm: overrides.requiredBpm ?? null
    };
    const assignment = await AssignmentRepository.createAssignment(
      { classId, createdById: lecturerId, status, publishedAt: status === 'DRAFT' ? null : new Date(), deadline: classRecord.endDate },
      content,
      TestDatabase.prisma
    );
    await AssignmentRepository.createVersionAndMakeCurrent(assignment.id, 1, content, lecturerId, TestDatabase.prisma);
    return TestDatabase.prisma.assignment.update({
      where: { id: assignment.id },
      data: { deletedAt: overrides.deletedAt ?? null },
      include: { currentVersion: true }
    });
  }

  static async createSubmission(
    assignmentId: string,
    studentId: string,
    overrides: Partial<{ status: 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED'; accuracy: number | null; submittedAt: Date; versionId: string }> = {}
  ) {
    const assignment = await TestDatabase.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { class: { select: { instrumentId: true } }, sheetMusic: { select: { pieceId: true } } }
    });
    const status = overrides.status ?? 'COMPLETED';
    // Every submission belongs to a piece; assignments without sheet music get a throwaway piece
    const pieceId = assignment.sheetMusic?.pieceId ?? (await TestDatabase.createPiece(assignment.class.instrumentId)).id;
    return TestDatabase.prisma.submission.create({
      data: {
        assignmentId,
        pieceId,
        assignmentVersionId: overrides.versionId ?? (assignment.currentVersionId as string),
        studentId,
        fileUrl: '/samples/bvc-sample.wav',
        status,
        accuracy: overrides.accuracy === undefined ? (status === 'COMPLETED' ? 80 : null) : overrides.accuracy,
        createdAt: overrides.submittedAt ?? new Date()
      }
    });
  }

  static async addMember(classId: string, studentId: string, addedById: string) {
    const classRecord = await TestDatabase.prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { instrumentId: true } });
    return TestDatabase.prisma.classMember.create({ data: { classId, userId: studentId, instrumentId: classRecord.instrumentId, addedById, source: 'MANUAL' } });
  }

  static tokenFor(user: { id: string; email: string; username: string; role: number; status: Backend.UserStatus; studentCode?: string | null }): string {
    return `Bearer ${AuthService.createAccessToken({ ...user, studentCode: user.studentCode ?? null })}`;
  }

  static futureDate(days: number = 7): string {
    return DateTimeUtil.addDays(DateTimeUtil.todayInVietnam(), days);
  }
}
