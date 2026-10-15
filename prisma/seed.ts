// Development seed for M03 sub-project 1 (classes, members). Idempotent: safe to run twice.
// Usage: DATABASE_URL=postgresql://bvc:bvc_local@localhost:5433/bvc_dev npm run db:seed
// Optional: SEED_LECTURER_EMAIL=<your Google email> makes lecturer #1 your own account for manual testing.
import PrismaClientProvider from '../src/config/PrismaClient.ts';
import DateTimeUtil from '../src/utils/DateTimeUtil.ts';

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

  static async upsertClass(data: { name: string; cohort: string; instrumentId: string; lecturerId: string; startDate: string; status: 'ACTIVE' | 'FINISHED'; description?: string }) {
    const existing = await prisma.class.findFirst({ where: { cohort: data.cohort, name: { equals: data.name, mode: 'insensitive' } } });
    if (existing) return existing;
    return prisma.class.create({
      data: {
        name: data.name,
        cohort: data.cohort,
        description: data.description ?? null,
        instrumentId: data.instrumentId,
        lecturerId: data.lecturerId,
        startDate: DateTimeUtil.toDateOnly(data.startDate),
        endDate: DateTimeUtil.toDateOnly(DateTimeUtil.addDays(data.startDate, 42)),
        status: data.status,
        endedAt: data.status === 'FINISHED' ? new Date() : null
      }
    });
  }

  static async enroll(classId: string, studentIds: string[], addedById: string): Promise<void> {
    for (const studentId of studentIds) {
      const isMember = await prisma.classMember.findFirst({ where: { classId, studentId, removedAt: null } });
      if (!isMember) await prisma.classMember.create({ data: { classId, studentId, addedById, source: 'MANUAL' } });
    }
  }

  static async run(): Promise<void> {
    SeedRunner.assertSafeTarget();
    const today = DateTimeUtil.todayInVietnam();

    await SeedRunner.upsertUser('admin@bvc.local', 'Quản trị viên', ROLES.SYSTEM_ADMIN);
    const lecturer = await SeedRunner.upsertUser(process.env.SEED_LECTURER_EMAIL || 'huongnt@bvc.local', 'Nguyễn Thu Hương', ROLES.TEACHER);
    const otherLecturer = await SeedRunner.upsertUser('baotq@bvc.local', 'Trương Quốc Bảo', ROLES.TEACHER);

    const instruments = [];
    for (const name of INSTRUMENTS) {
      instruments.push(await prisma.instrument.upsert({ where: { name }, update: {}, create: { name } }));
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
      startDate: DateTimeUtil.addDays(today, -150), status: 'FINISHED'
    });
    const otherClass = await SeedRunner.upsertClass({
      name: 'TRD401 — Hòa tấu nâng cao', cohort: 'FA26', instrumentId: instruments[2].id, lecturerId: otherLecturer.id,
      startDate: DateTimeUtil.addDays(today, 7), status: 'ACTIVE'
    });

    await SeedRunner.enroll(runningClass.id, students.slice(0, 20).map((student) => student.id), lecturer.id);
    await SeedRunner.enroll(finishedClass.id, students.slice(15, 25).map((student) => student.id), lecturer.id);
    await SeedRunner.enroll(otherClass.id, students.slice(20, 30).map((student) => student.id), otherLecturer.id);

    console.log(`Seeded: 3 users (admin/lecturers), ${students.length} students, ${instruments.length} instruments, 3 classes.`);
    console.log(`Lecturer #1 login email: ${lecturer.email}`);
  }
}

SeedRunner.run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
