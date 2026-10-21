// Development seed for M03 (classes, members, roadmaps, assignments, grading thresholds). Idempotent: safe to run twice.
// Usage: DATABASE_URL=postgresql://bvc:bvc_local@localhost:5433/bvc_dev npm run db:seed:classes
// Optional: SEED_LECTURER_EMAIL=<your Google email> makes lecturer #1 your own account for manual testing.
import PrismaClientProvider from '../../src/config/PrismaClient.ts';
import DateTimeUtil from '../../src/utils/DateTimeUtil.ts';
import RoadmapConstant from '../../src/modules/roadmaps/constant/RoadmapConstant.ts';
import RoadmapService from '../../src/modules/roadmaps/service/RoadmapService.ts';
import AssignmentRepository from '../../src/modules/assignments/repository/AssignmentRepository.ts';
import PlatformConstant from '../../src/modules/platform/constant/PlatformConstant.ts';
import TextNormalizer from '../../src/utils/TextNormalizer.ts';

const prisma = PrismaClientProvider.instance;
const ROLES = { STUDENT: 1, TEACHER: 2, SYSTEM_ADMIN: 3 };
const INSTRUMENTS = ['Đàn tranh', 'Đàn bầu', 'Tỳ bà', 'Sáo trúc'];
const STUDENT_NAMES = [
  'Trần Minh Anh', 'Phạm Gia Hân', 'Ngô Thảo My', 'Lê Quốc Bảo', 'Vũ Hải Đăng', 'Nguyễn Thị Lan', 'Đỗ Văn Hùng',
  'Hoàng Mai Chi', 'Bùi Tuấn Kiệt', 'Đặng Ngọc Hà', 'Phan Thanh Tùng', 'Võ Khánh Linh', 'Trịnh Đức Minh', 'Lý Bảo Ngọc',
  'Mai Xuân Phúc', 'Đinh Thu Trang', 'Cao Minh Quân', 'Tạ Hồng Nhung', 'Lương Gia Huy', 'Châu Mỹ Duyên', 'Hồ Văn Nam',
  'Kiều Phương Thảo', 'Dương Quang Vinh', 'Tôn Nữ Hạnh', 'Quách Thành Đạt', 'Âu Thị Yến', 'Lâm Hoàng Long', 'Vương Kim Oanh',
  'Thái Bảo Trâm', 'Mạc Đình Khoa'
];

// TODO(M02): sample library pieces until the music library module exists.
const FINGER_EXERCISES = ['Luyện ngón — Gẩy đơn', 'Luyện ngón — Vê', 'Luyện ngón — Láy'];
const SAMPLE_SONG = 'Lý ngựa ô';
const HIDDEN_EXERCISE = 'Luyện ngón — Bản cũ (đã ẩn)';
const ROADMAP_INSTRUMENTS = ['Đàn tranh', 'Đàn bầu'];
const WEEK_CONTENTS = [
  'Tư thế ngồi, cách cầm và lên dây. Làm quen các nốt cơ bản.',
  'Luyện ngón cơ bản và tập Bài 1 theo bản mẫu.',
  'Hoàn thiện Bài 1, kiểm tra cá nhân và trình bày theo nhóm.',
  'Sửa lỗi kỹ thuật, luyện tempo đều để chuẩn bị hòa tấu.',
  'Chia nhóm và tập hòa tấu cùng track mẫu.',
  'Tổng duyệt và biểu diễn cuối khóa.'
];

// Practice assignments for TRD301 (sub-project 3a). Accuracy values spread from 20 % to 95 %.
const SAMPLE_AUDIO_URL = '/samples/bvc-sample.wav';
const SEED_ASSIGNMENTS: Array<{ title: string; kind: 'SOLO' | 'ENSEMBLE' | 'BONUS' | 'OTHER'; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; deleted?: boolean; description: string }> = [
  { title: 'Độc tấu — Lý ngựa ô', kind: 'SOLO', status: 'PUBLISHED', description: 'Tập chậm ở 70 BPM rồi tăng dần lên tempo mẫu.' },
  { title: 'Hòa tấu cùng track mẫu', kind: 'ENSEMBLE', status: 'PUBLISHED', description: 'Thu âm cùng track hòa tấu, chú ý vào nhịp đúng phách.' },
  { title: 'Bonus — Ngẫu hứng 8 ô nhịp', kind: 'BONUS', status: 'CLOSED', description: 'Tự chọn giai điệu ngắn.' },
  { title: 'Luyện vê đều tay', kind: 'OTHER', status: 'DRAFT', description: 'Chuẩn bị cho tuần sau.' },
  { title: 'Bài cũ (đã xóa)', kind: 'OTHER', status: 'PUBLISHED', deleted: true, description: 'Đã thay bằng bài khác.' }
];
const SEED_ACCURACIES = [95, 88, 82, 76, 71, 64, 58, 45, 33, 20];
const SEED_COMMENTS = ['Nhịp ổn, chú ý ngón vê ở ô nhịp 5.', 'Tempo còn nhanh dần, tập lại với metronome.', 'Tốt, giữ cách bấm như lần này.'];

class SeedRunner {
  static assertSafeTarget(): void {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (databaseUrl.includes(':5433/') || process.env.ALLOW_SEED === 'true') return;
    throw new Error('Refusing to seed: DATABASE_URL is not the local dev DB (port 5433). Set ALLOW_SEED=true to override.');
  }

  static async upsertUser(email: string, username: string, role: number, extra: { status?: 'PENDING' | 'ACTIVE'; studentCode?: string } = {}) {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, username, role, status: extra.status ?? 'ACTIVE', studentCode: extra.studentCode ?? null }
    });
  }

  static async upsertClass(data: { name: string; cohort: string; instrumentId: string; lecturerId: string; startDate: string; status: 'ACTIVE' | 'ENDED'; description?: string }) {
    const existing = await prisma.class.findFirst({ where: { cohort: data.cohort, name: { equals: data.name, mode: 'insensitive' } } });
    if (existing) return existing;
    return prisma.class.create({
      data: {
        name: data.name,
        cohort: data.cohort,
        description: data.description ?? null,
        instrumentId: data.instrumentId,
        ownerId: data.lecturerId,
        startDate: DateTimeUtil.toDateOnly(data.startDate),
        endDate: DateTimeUtil.toDateOnly(DateTimeUtil.addDays(data.startDate, 42)),
        status: data.status,
        endedAt: data.status === 'ENDED' ? new Date() : null
      }
    });
  }

  static async upsertCategory(type: 'GENRE' | 'LEVEL', name: string) {
    return prisma.category.upsert({ where: { type_name: { type, name } }, update: {}, create: { type, name } });
  }

  static async upsertPiece(instrumentId: string, ownerId: string, title: string, kind: 'FINGER_EXERCISE' | 'SONG', isVisible: boolean = true) {
    const existing = await prisma.piece.findFirst({ where: { title, instruments: { some: { instrumentId } } } });
    if (existing) return existing;
    const genre = await SeedRunner.upsertCategory('GENRE', 'Dân ca Nam Bộ');
    const level = await SeedRunner.upsertCategory('LEVEL', 'Cơ bản');
    return prisma.piece.create({
      data: {
        ownerId,
        title,
        kind,
        bpm: 90,
        visibility: isVisible ? 'PUBLIC' : 'HIDDEN',
        genreId: genre.id,
        levelId: level.id,
        titleNormalized: TextNormalizer.normalize(title),
        searchText: TextNormalizer.normalize(title),
        instruments: { create: [{ instrumentId }] }
      }
    });
  }

  // Grading thresholds live in system_configs; there is no code fallback.
  static async seedGradingSettings(): Promise<void> {
    const { MIN_ACCURACY, AT_RISK_MARGIN } = PlatformConstant.settingKeys;
    await prisma.systemConfig.upsert({
      where: { key: MIN_ACCURACY },
      update: {},
      create: { key: MIN_ACCURACY, value: '70', valueType: 'NUMBER', group: 'SCORING', label: 'Độ chính xác tối thiểu để đạt (%)' }
    });
    const { group, valueType, label, description } = PlatformConstant.atRiskMarginConfig;
    await prisma.systemConfig.upsert({ where: { key: AT_RISK_MARGIN }, update: {}, create: { key: AT_RISK_MARGIN, value: '10', valueType, group, label, description } });
  }

  // Uses the real save path so the version, immutability and backfill rules match the app.
  static async seedRoadmap(instrumentId: string, adminId: string, exerciseIds: string[]): Promise<void> {
    if (await prisma.roadmap.findFirst({ where: { instrumentId } })) return;
    const weeks = RoadmapConstant.standardFrameworkTitles.map((title, index) => ({
      weekNumber: index + 1,
      title,
      content: WEEK_CONTENTS[index],
      exerciseIds: index < 4 ? exerciseIds.slice(0, index % 2 === 0 ? 2 : 1) : []
    }));
    await RoadmapService.saveVersion(instrumentId, adminId, weeks, null);
  }

  static async seedAssignments(classId: string, lecturerId: string, pieceId: string | null): Promise<void> {
    const classRecord = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { endDate: true } });
    const members = await prisma.classMember.findMany({ where: { classId, removedAt: null }, orderBy: { joinedAt: 'asc' }, select: { userId: true } });
    for (const [index, item] of SEED_ASSIGNMENTS.entries()) {
      const existing = await prisma.assignment.findFirst({ where: { classId, currentVersion: { title: item.title } } });
      if (existing) continue;
      const content = { title: item.title, description: item.description, kind: item.kind, pieceId: index === 0 ? pieceId : null };
      const assignment = await AssignmentRepository.createAssignment(
        { classId, createdById: lecturerId, status: item.status, publishedAt: item.status === 'DRAFT' ? null : new Date(), deadline: classRecord.endDate },
        content,
        prisma
      );
      await AssignmentRepository.createVersionAndMakeCurrent(assignment.id, 1, content, lecturerId, prisma);
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { closedAt: item.status === 'CLOSED' ? new Date() : null, deletedAt: item.deleted ? new Date() : null }
      });
      const version = await prisma.assignmentVersion.findFirstOrThrow({ where: { assignmentId: assignment.id }, select: { id: true } });
      if (item.status !== 'DRAFT') await SeedRunner.seedSubmissions(assignment.id, version.id, lecturerId, members.map((member) => member.userId), index);
    }
  }

  static async seedSubmissions(assignmentId: string, versionId: string, lecturerId: string, studentIds: string[], offset: number): Promise<void> {
    for (const [index, studentId] of studentIds.slice(0, 10).entries()) {
      const accuracy = SEED_ACCURACIES[(index + offset) % SEED_ACCURACIES.length];
      const submittedAt = new Date(Date.now() - (index + 1) * 3600 * 1000);
      const submission = await prisma.submission.create({
        data: { assignmentId, assignmentVersionId: versionId, studentId, fileUrl: SAMPLE_AUDIO_URL, status: 'COMPLETED', accuracy, tempoDeviation: (index % 4) * 2.5, createdAt: submittedAt, analyzedAt: submittedAt }
      });
      if (index === 1) {
        await prisma.submission.create({ data: { assignmentId, assignmentVersionId: versionId, studentId, fileUrl: SAMPLE_AUDIO_URL, status: 'REJECTED', createdAt: submittedAt } });
      }
      if (index === 2) {
        await prisma.submission.create({ data: { assignmentId, assignmentVersionId: versionId, studentId, fileUrl: SAMPLE_AUDIO_URL, status: 'FAILED', createdAt: submittedAt } });
      }
      if (offset === 0 && index < SEED_COMMENTS.length) {
        await prisma.submissionComment.create({ data: { submissionId: submission.id, lecturerId, content: SEED_COMMENTS[index] } });
      }
    }
  }

  static async enroll(classId: string, instrumentId: string, studentIds: string[], addedById: string): Promise<void> {
    for (const userId of studentIds) {
      const isMember = await prisma.classMember.findFirst({ where: { classId, userId, removedAt: null } });
      if (!isMember) await prisma.classMember.create({ data: { classId, userId, instrumentId, addedById, source: 'MANUAL' } });
    }
  }

  static async run(): Promise<void> {
    SeedRunner.assertSafeTarget();
    const today = DateTimeUtil.todayInVietnam();

    const admin = await SeedRunner.upsertUser('admin@bvc.local', 'Quản trị viên', ROLES.SYSTEM_ADMIN);
    const lecturer = await SeedRunner.upsertUser(process.env.SEED_LECTURER_EMAIL || 'huongnt@bvc.local', 'Nguyễn Thu Hương', ROLES.TEACHER);
    const otherLecturer = await SeedRunner.upsertUser('baotq@bvc.local', 'Trương Quốc Bảo', ROLES.TEACHER);

    await SeedRunner.seedGradingSettings();
    const instruments = [];
    for (const name of INSTRUMENTS) {
      const existing = await prisma.instrument.findFirst({ where: { name } });
      instruments.push(existing ?? (await prisma.instrument.create({ data: { name, code: TextNormalizer.normalize(name).replace(/\s+/g, '_').toUpperCase() } })));
    }

    const students = [];
    for (const [index, fullName] of STUDENT_NAMES.entries()) {
      const studentCode = `SE17${String(1000 + index).padStart(4, '0')}`;
      const status = index >= STUDENT_NAMES.length - 8 ? 'PENDING' : 'ACTIVE';
      students.push(await SeedRunner.upsertUser(`${studentCode.toLowerCase()}@fpt.edu.vn`, fullName, ROLES.STUDENT, { status, studentCode }));
    }

    const runningClass = await SeedRunner.upsertClass({
      name: 'TRD301 — Nhạc cụ truyền thống', cohort: 'FA26', instrumentId: instruments[0].id, lecturerId: lecturer.id,
      startDate: DateTimeUtil.addDays(today, -21), status: 'ACTIVE', description: 'Lớp đàn tranh học kỳ Fall 2026.'
    });
    const finishedClass = await SeedRunner.upsertClass({
      name: 'TRD201 — Nhạc cụ cơ bản', cohort: 'SP26', instrumentId: instruments[1].id, lecturerId: lecturer.id,
      startDate: DateTimeUtil.addDays(today, -150), status: 'ENDED'
    });
    const otherClass = await SeedRunner.upsertClass({
      name: 'TRD401 — Hòa tấu nâng cao', cohort: 'FA26', instrumentId: instruments[2].id, lecturerId: otherLecturer.id,
      startDate: DateTimeUtil.addDays(today, 7), status: 'ACTIVE'
    });

    await SeedRunner.enroll(runningClass.id, runningClass.instrumentId, students.slice(0, 20).map((student) => student.id), lecturer.id);
    await SeedRunner.enroll(finishedClass.id, finishedClass.instrumentId, students.slice(15, 25).map((student) => student.id), lecturer.id);
    await SeedRunner.enroll(otherClass.id, otherClass.instrumentId, students.slice(20, 30).map((student) => student.id), otherLecturer.id);

    for (const instrument of instruments) {
      const exercises = [];
      for (const title of FINGER_EXERCISES) exercises.push(await SeedRunner.upsertPiece(instrument.id, admin.id, title, 'FINGER_EXERCISE'));
      await SeedRunner.upsertPiece(instrument.id, admin.id, SAMPLE_SONG, 'SONG');
      await SeedRunner.upsertPiece(instrument.id, admin.id, HIDDEN_EXERCISE, 'FINGER_EXERCISE', false);
      if (ROADMAP_INSTRUMENTS.includes(instrument.name)) {
        await SeedRunner.seedRoadmap(instrument.id, admin.id, exercises.map((exercise) => exercise.id));
      }
    }

    const tranhSong = await prisma.piece.findFirst({ where: { instruments: { some: { instrumentId: runningClass.instrumentId } }, kind: 'SONG' } });
    await SeedRunner.seedAssignments(runningClass.id, lecturer.id, tranhSong?.id ?? null);

    console.log(`Seeded: 3 users (admin/lecturers), ${students.length} students, ${instruments.length} instruments, 3 classes, library pieces, roadmaps v1 for ${ROADMAP_INSTRUMENTS.join(', ')}, TRD301 assignments with submissions.`);
    console.log(`Lecturer #1 login email: ${lecturer.email}`);
  }
}

SeedRunner.run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
