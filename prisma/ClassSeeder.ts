import path from 'node:path';
import PrismaClientProvider from '../src/config/PrismaClient.ts';
import SeedAudioService from './SeedAudioService.ts';
import TextNormalizer from '../src/utils/TextNormalizer.ts';

interface AssignmentSeed {
  id: string;
  title: string;
  type: 'PRACTICE' | 'RHYTHM' | 'RECORDING' | 'SHEET' | 'BONUS' | 'EXAM';
  deadlineDays: number;
  isPublished: boolean;
  withPiece?: boolean;
  targetBpm?: number;
  minAccuracy?: number;
  bonusPoints?: number;
  weekNo?: number;
  description?: string;
}

export default class ClassSeeder {
  static readonly dayMs = 24 * 60 * 60 * 1000;
  static readonly pieceId = 'seed-piece-ly-ngua-o';
  static readonly classId = 'seed-class-trd301';
  static readonly teacherEmail = 'teacher@seed.bvc.test';
  static readonly secondTeacherEmail = 'teacher2@seed.bvc.test';
  static readonly studentEmails = [1, 2, 3, 4, 5].map((index) => `student${index}@seed.bvc.test`);
  static readonly ensembleTracks = [
    { instrumentCode: 'sao-truc', frequency: 440, volume: 0.7 },
    { instrumentCode: 'dan-bau', frequency: 330, volume: 0.9 },
    { instrumentCode: 'ty-ba', frequency: 392, volume: 0.7 },
    { instrumentCode: 'bo-go', frequency: 220, volume: 1 }
  ];
  static readonly assignments: AssignmentSeed[] = [
    { id: 'seed-asg-rhythm-34', title: 'Rhythm drill — nhịp 3/4', type: 'RHYTHM', deadlineDays: -10, isPublished: true, description: 'Luyện nhịp 3/4 với metronome.' },
    { id: 'seed-asg-finger-3', title: 'Bài luyện ngón số 3', type: 'PRACTICE', deadlineDays: -5, isPublished: true, description: 'Bài luyện ngón cơ bản số 3.' },
    { id: 'seed-asg-recording', title: 'Recording — Lý ngựa ô', type: 'RECORDING', deadlineDays: 7, isPublished: true, withPiece: true, targetBpm: 84, minAccuracy: 85, weekNo: 4, description: 'Thu bản đàn tranh đầy đủ, bật metronome ở đoạn đảo phách. Nghe kỹ bản mẫu trước khi thu.' },
    { id: 'seed-asg-rhythm-24', title: 'Bài luyện rhythm — ô nhịp 2/4', type: 'RHYTHM', deadlineDays: 3, isPublished: true, description: 'Luyện ô nhịp 2/4.' },
    { id: 'seed-asg-exam-3', title: 'Kiểm tra cá nhân tuần 3', type: 'EXAM', deadlineDays: -20, isPublished: true, minAccuracy: 70, description: 'Bài kiểm tra cá nhân.' },
    { id: 'seed-asg-bonus', title: 'Bonus — Lý ngựa ô nâng cao', type: 'BONUS', deadlineDays: 14, isPublished: true, withPiece: true, minAccuracy: 90, bonusPoints: 5, description: 'Bài bonus ngoài syllabus.' },
    { id: 'seed-asg-draft', title: 'Bài nháp chưa giao', type: 'PRACTICE', deadlineDays: 20, isPublished: false }
  ];
  static readonly submissions: { student: number; assignment: string; accuracy: number; status?: 'COMPLETED' | 'REJECTED' | 'FAILED' }[] = [
    { student: 1, assignment: 'seed-asg-rhythm-34', accuracy: 91 },
    { student: 1, assignment: 'seed-asg-finger-3', accuracy: 88 },
    { student: 1, assignment: 'seed-asg-exam-3', accuracy: 92 },
    { student: 2, assignment: 'seed-asg-rhythm-34', accuracy: 66 },
    { student: 2, assignment: 'seed-asg-finger-3', accuracy: 64 },
    { student: 2, assignment: 'seed-asg-recording', accuracy: 0, status: 'REJECTED' },
    { student: 3, assignment: 'seed-asg-rhythm-34', accuracy: 55 },
    { student: 3, assignment: 'seed-asg-finger-3', accuracy: 49 },
    { student: 5, assignment: 'seed-asg-rhythm-34', accuracy: 80 },
    { student: 5, assignment: 'seed-asg-bonus', accuracy: 95 }
  ];

  async run(): Promise<void> {
    const client = PrismaClientProvider.instance;
    const instruments = Object.fromEntries((await client.instrument.findMany()).map((item) => [item.code, item.id]));
    const danTranh = instruments['dan-tranh'];

    const teacher = await client.user.upsert({ where: { email: ClassSeeder.teacherEmail }, update: {}, create: { email: ClassSeeder.teacherEmail, username: 'Nguyễn Thu Hương', role: 2, status: 'ACTIVE' } });
    const secondTeacher = await client.user.upsert({ where: { email: ClassSeeder.secondTeacherEmail }, update: {}, create: { email: ClassSeeder.secondTeacherEmail, username: 'Bùi Đức Trung', role: 2, status: 'ACTIVE' } });
    const students = [];
    for (const [index, email] of ClassSeeder.studentEmails.entries()) {
      const studentCode = `SE17008${index + 1}`;
      const names = ['Lê Quốc Bảo', 'Đỗ Khánh Linh', 'Trần Minh Anh', 'Phạm Thu Hà', 'Ngô Thảo My'];
      students.push(await client.user.upsert({ where: { email }, update: {}, create: { email, username: names[index], role: 1, status: 'ACTIVE', studentCode } }));
    }

    await client.class.upsert({
      where: { id: ClassSeeder.classId },
      update: {},
      create: { id: ClassSeeder.classId, name: 'TRD301 FA26', instrumentId: danTranh, ownerId: teacher.id, startDate: new Date(Date.now() - 21 * ClassSeeder.dayMs) }
    });
    await client.class.upsert({
      where: { id: 'seed-class-trd201' },
      update: {},
      create: { id: 'seed-class-trd201', name: 'TRD201 FA26', instrumentId: danTranh, ownerId: secondTeacher.id, startDate: new Date(Date.now() - 14 * ClassSeeder.dayMs) }
    });
    for (const student of students) {
      const membership = await client.classMember.findFirst({ where: { classId: ClassSeeder.classId, userId: student.id, removedAt: null }, select: { id: true } });
      if (!membership) await client.classMember.create({ data: { classId: ClassSeeder.classId, userId: student.id, instrumentId: danTranh } });
    }

    const genre = await client.category.upsert({ where: { type_name: { type: 'GENRE', name: 'Dân ca' } }, update: {}, create: { type: 'GENRE', name: 'Dân ca' } });
    const level = await client.category.upsert({ where: { type_name: { type: 'LEVEL', name: 'Trung cấp' } }, update: {}, create: { type: 'LEVEL', name: 'Trung cấp' } });
    const pieceTitle = 'Lý ngựa ô';
    const pieceComposer = 'Dân ca Nam Bộ';
    await client.piece.upsert({
      where: { id: ClassSeeder.pieceId },
      update: {},
      create: {
        id: ClassSeeder.pieceId,
        ownerId: teacher.id,
        title: pieceTitle,
        composer: pieceComposer,
        bpm: 96,
        visibility: 'PUBLIC',
        genreId: genre.id,
        levelId: level.id,
        titleNormalized: TextNormalizer.normalize(pieceTitle),
        composerNormalized: TextNormalizer.normalize(pieceComposer),
        searchText: TextNormalizer.normalize(`${pieceTitle} ${pieceComposer}`)
      }
    });
    for (const track of ClassSeeder.ensembleTracks) {
      const relativeUrl = `/uploads/seed/${track.instrumentCode}.wav`;
      SeedAudioService.writeTone(path.resolve('uploads', 'seed', `${track.instrumentCode}.wav`), track.frequency, 20);
      await client.ensembleTrack.upsert({
        where: { pieceId_instrumentId: { pieceId: ClassSeeder.pieceId, instrumentId: instruments[track.instrumentCode] } },
        update: {},
        create: { pieceId: ClassSeeder.pieceId, instrumentId: instruments[track.instrumentCode], fileUrl: relativeUrl, durationSec: 20, defaultVolume: track.volume }
      });
    }

    for (const item of ClassSeeder.assignments) {
      const data = {
        classId: ClassSeeder.classId,
        pieceId: item.withPiece ? ClassSeeder.pieceId : null,
        title: item.title,
        type: item.type,
        description: item.description ?? '',
        weekNo: item.weekNo ?? null,
        deadline: new Date(Date.now() + item.deadlineDays * ClassSeeder.dayMs),
        targetBpm: item.targetBpm ?? null,
        minAccuracy: item.minAccuracy ?? null,
        isPublished: item.isPublished,
        bonusPoints: item.bonusPoints ?? null
      };
      await client.assignment.upsert({ where: { id: item.id }, update: { deadline: data.deadline }, create: { id: item.id, ...data } });
    }
    await this.seedRubric(client);

    for (const [index, item] of ClassSeeder.submissions.entries()) {
      const id = `seed-sub-${index}`;
      await client.submission.upsert({
        where: { id },
        update: {},
        create: {
          id,
          assignmentId: item.assignment,
          studentId: students[item.student - 1].id,
          status: item.status ?? 'COMPLETED',
          accuracy: item.status === 'REJECTED' ? null : item.accuracy
        }
      });
    }
  }

  private async seedRubric(client: typeof PrismaClientProvider.instance): Promise<void> {
    const rubric = await client.rubric.upsert({ where: { assignmentId: 'seed-asg-recording' }, update: {}, create: { assignmentId: 'seed-asg-recording' } });
    if ((await client.rubricCriterion.count({ where: { rubricId: rubric.id } })) > 0) return;
    const criteria = [['Cao độ', 30], ['Nhịp / phách', 30], ['Tempo', 20], ['Kỹ thuật & biểu cảm', 20]] as const;
    for (const [position, [name, weight]] of criteria.entries()) {
      await client.rubricCriterion.create({ data: { rubricId: rubric.id, name, weight, position } });
    }
  }
}
