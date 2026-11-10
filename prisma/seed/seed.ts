import crypto from 'node:crypto';
import type { MediaKind, Prisma } from '@prisma/client';
import EnvConfig from '../../src/config/EnvConfig.ts';
import PrismaClientProvider from '../../src/config/PrismaClient.ts';
import StorageService from '../../src/lib/storage/StorageService.ts';
import AuthService from '../../src/modules/auth/service/AuthService.ts';
import AuthConstant from '../../src/modules/auth/constant/AuthConstant.ts';
import TextNormalizer from '../../src/utils/TextNormalizer.ts';
import PlatformConstant from '../../src/modules/platform/constant/PlatformConstant.ts';
import SampleMediaFactory from './SampleMediaFactory.ts';
import FaqSeeder from './FaqSeeder.ts';

interface SheetSeed { instrument: string; kind: 'MAIN' | 'LEVEL'; name: string; level: string; audioSec?: number; isHidden?: boolean; }
interface PieceSeed {
  title: string;
  composer: string;
  description: string;
  genre: string;
  isPublic: boolean;
  hasCover?: boolean;
  adminHiddenReason?: string;
  sheets: SheetSeed[];
}

const prisma = PrismaClientProvider.instance;

export default class DatabaseSeeder {
  static readonly instruments = [
    { code: 'DTR103', name: 'Đàn tranh', fminHz: 98, fmaxHz: 1568, toleranceCents: 30, description: 'Đàn 16 dây gảy bằng móng.' },
    { code: 'DBA103', name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35, description: 'Đàn một dây, kỹ thuật bồi âm.' },
    { code: 'DSA103', name: 'Sáo trúc', fminHz: 261, fmaxHz: 2093, toleranceCents: 30, description: 'Sáo ngang làm từ ống trúc.' },
    { code: 'DTB103', name: 'Tỳ bà', fminHz: 110, fmaxHz: 1760, toleranceCents: 30, description: 'Đàn 4 dây hình quả lê.' },
    { code: 'DNH103', name: 'Đàn nhị', fminHz: 293, fmaxHz: 1760, toleranceCents: 35, description: 'Đàn hai dây kéo bằng cung vĩ.' }
  ];

  static readonly instrumentTunes: Record<string, { tuneName: string; pitch: number; displayOrder: number }[]> = {
    DNH103: [
      { tuneName: 'Dây 1 (Re 5)', pitch: 587.33, displayOrder: 1 },
      { tuneName: 'Dây 2 (Sol 4)', pitch: 392.0, displayOrder: 2 },
    ],
    DBA103: [
      { tuneName: 'Dây buông (Do 3)', pitch: 130.81, displayOrder: 1 },
      { tuneName: 'Dây buông quãng 8 (Do 4)', pitch: 261.63, displayOrder: 2 },
    ],
    DTB103: [
      { tuneName: 'Dây 1 (Do 5)', pitch: 523.25, displayOrder: 1 },
      { tuneName: 'Dây 2 (Sol 4)', pitch: 392.0, displayOrder: 2 },
      { tuneName: 'Dây 3 (Fa 4)', pitch: 349.23, displayOrder: 3 },
      { tuneName: 'Dây 4 (Do 4)', pitch: 261.63, displayOrder: 4 },
    ],
    DTR103: [
      { tuneName: 'Dây 1 (Sol 3)', pitch: 196.0, displayOrder: 1 },
      { tuneName: 'Dây 2 (La 3)', pitch: 220.0, displayOrder: 2 },
      { tuneName: 'Dây 3 (Do 4)', pitch: 261.63, displayOrder: 3 },
      { tuneName: 'Dây 4 (Re 4)', pitch: 293.66, displayOrder: 4 },
      { tuneName: 'Dây 5 (Mi 4)', pitch: 329.63, displayOrder: 5 },
      { tuneName: 'Dây 6 (Sol 4)', pitch: 392.0, displayOrder: 6 },
    ],
    DSA103: [
      { tuneName: 'Do 5 (C5)', pitch: 523.25, displayOrder: 1 },
      { tuneName: 'Re 5 (D5)', pitch: 587.33, displayOrder: 2 },
      { tuneName: 'Mi 5 (E5)', pitch: 659.25, displayOrder: 3 },
      { tuneName: 'Fa 5 (F5)', pitch: 698.46, displayOrder: 4 },
      { tuneName: 'Sol 5 (G5)', pitch: 783.99, displayOrder: 5 },
      { tuneName: 'La 5 (A5)', pitch: 880.0, displayOrder: 6 },
    ],
  };

  // Codes used before the 103 suffix (long names and short forms); renamed in place so re-seeding an existing DB does not duplicate instruments.
  static readonly legacyInstrumentCodes: Record<string, string> = { DAN_TRANH: 'DTR103', DAN_BAU: 'DBA103', SAO_TRUC: 'DSA103', TY_BA: 'DTB103', DTR: 'DTR103', DBA: 'DBA103', DSA: 'DSA103', DTB: 'DTB103', DNH: 'DNH103' };

  static readonly genres = ['Dân ca Bắc Bộ', 'Dân ca Trung Bộ', 'Dân ca Nam Bộ', 'Nhạc tài tử', 'Nhạc cung đình', 'Nhạc mới'];
  static readonly levels = ['Cơ bản', 'Trung cấp', 'Nâng cao'];

  static readonly systemConfig: Record<string, { value: string; label: string }> = {
    'upload.cover.max_mb': { value: '5', label: 'Dung lượng ảnh bìa tối đa (MB)' },
    'upload.sheet.max_mb': { value: '10', label: 'Dung lượng file bản nhạc tối đa (MB)' },
    'upload.audio.max_mb': { value: '20', label: 'Dung lượng audio mẫu tối đa (MB)' },
    'upload.audio.min_duration_sec': { value: '1', label: 'Thời lượng audio mẫu tối thiểu (giây)' },
    'upload.audio.max_duration_sec': { value: '600', label: 'Thời lượng audio mẫu tối đa (giây)' },
    'upload.video.max_mb': { value: '200', label: 'Dung lượng video hướng dẫn tối đa (MB)' }
  };

  // Grading thresholds and practice rules read by services. Existing rows are never overwritten.
  static readonly ruleConfig: Array<{ key: string; value: string; label: string; group: 'SCORING' | 'PRACTICE_RULE' }> = [
    { key: 'min_accuracy_default', value: '70', label: 'Độ chính xác tối thiểu để đạt (%)', group: 'SCORING' },
    { key: 'threshold_excellent', value: '90', label: 'Ngưỡng xuất sắc (%)', group: 'SCORING' },
    { key: 'threshold_good', value: '80', label: 'Ngưỡng khá (%)', group: 'SCORING' },
    { key: 'threshold_pass', value: '70', label: 'Ngưỡng đạt (%)', group: 'SCORING' },
    { key: 'ensemble_min_data_percent', value: '50', label: 'Tỷ lệ dữ liệu tối thiểu cho ensemble (%)', group: 'SCORING' },
    { key: 'default_max_submissions', value: '5', label: 'Số bài nộp tối đa mặc định', group: 'PRACTICE_RULE' },
    { key: 'practice_min_per_week', value: '3', label: 'Số buổi luyện tập tối thiểu mỗi tuần', group: 'PRACTICE_RULE' },
    { key: 'max_recording_sec', value: '600', label: 'Thời lượng bản thu tối đa (giây)', group: 'PRACTICE_RULE' },
    { key: 'max_recording_mb', value: '20', label: 'Dung lượng bản thu tối đa (MB)', group: 'PRACTICE_RULE' },
    { key: 'storage_capacity_gb', value: '10', label: 'Dung lượng lưu trữ tối đa (GB)', group: 'PRACTICE_RULE' }
  ];

  // Semesters offered on the create-class form, same values as ClassRoadmapSeed.
  // Six semesters for 2026: each season (Spring, Summer, Fall) is split into two halves.
  static readonly semesters = [
    { name: 'Spring2026_H1', startDate: '2026-01-05', endDate: '2026-02-22' },
    { name: 'Spring2026_H2', startDate: '2026-03-02', endDate: '2026-04-26' },
    { name: 'Summer2026_H1', startDate: '2026-05-04', endDate: '2026-06-28' },
    { name: 'Summer2026_H2', startDate: '2026-07-06', endDate: '2026-08-23' },
    { name: 'Fall2026_H1', startDate: '2026-09-07', endDate: '2026-11-01' },
    { name: 'Fall2026_H2', startDate: '2026-11-09', endDate: '2026-12-27' }
  ];

  static readonly users = [
    { email: 'giangvien.demo@bvc.local', username: 'Cô Lan (GV demo)', role: AuthConstant.roles.TEACHER },
    { email: 'giangvien2.demo@bvc.local', username: 'Thầy Minh (GV demo 2)', role: AuthConstant.roles.TEACHER },
    { email: 'sinhvien1.demo@bvc.local', username: 'An (SV demo)', role: AuthConstant.roles.STUDENT },
    { email: 'sinhvien2.demo@bvc.local', username: 'Bình (SV demo)', role: AuthConstant.roles.STUDENT },
    { email: 'admin.demo@bvc.local', username: 'Quản trị viên (Admin demo)', role: AuthConstant.roles.SYSTEM_ADMIN }
  ];

  static readonly pieces: PieceSeed[] = [
    {
      title: 'Lý ngựa ô', composer: 'Dân gian', genre: 'Dân ca Nam Bộ', isPublic: true, hasCover: true,
      description: 'Làn điệu dân ca Nam Bộ vui tươi, phù hợp làm bài nhập môn.',
      sheets: [
        { instrument: 'DTR103', kind: 'MAIN', name: 'Đàn tranh – bản gốc', level: 'Trung cấp', audioSec: 12 },
        { instrument: 'DTR103', kind: 'LEVEL', name: 'Đàn tranh – đơn giản', level: 'Cơ bản' },
        { instrument: 'DTR103', kind: 'LEVEL', name: 'Đàn tranh – luyến láy', level: 'Nâng cao', audioSec: 10 },
        { instrument: 'DSA103', kind: 'MAIN', name: 'Sáo trúc – bản gốc', level: 'Trung cấp', audioSec: 11 }
      ]
    },
    {
      title: 'Trống cơm', composer: 'Dân gian', genre: 'Dân ca Bắc Bộ', isPublic: true,
      description: 'Dân ca quan họ Bắc Ninh với tiết tấu rộn ràng.',
      sheets: [
        { instrument: 'DBA103', kind: 'MAIN', name: 'Đàn bầu – bản gốc', level: 'Cơ bản', audioSec: 9 },
        { instrument: 'DSA103', kind: 'LEVEL', name: 'Sáo trúc – nhập môn', level: 'Cơ bản' }
      ]
    },
    {
      title: 'Bèo dạt mây trôi', composer: 'Dân gian', genre: 'Dân ca Bắc Bộ', isPublic: true, hasCover: true,
      description: 'Bài dân ca trữ tình, giai điệu chậm, nhiều luyến láy.',
      sheets: [
        { instrument: 'DBA103', kind: 'MAIN', name: 'Đàn bầu – bản gốc', level: 'Trung cấp', audioSec: 14 },
        { instrument: 'DTR103', kind: 'MAIN', name: 'Đàn tranh – bản gốc', level: 'Trung cấp', audioSec: 13 },
        { instrument: 'DTR103', kind: 'LEVEL', name: 'Đàn tranh – rút gọn', level: 'Cơ bản' }
      ]
    },
    {
      title: 'Lưu thủy kim tiền', composer: 'Dân gian', genre: 'Nhạc tài tử', isPublic: true,
      description: 'Bài bản nhạc tài tử Nam Bộ.',
      sheets: [
        { instrument: 'DTB103', kind: 'MAIN', name: 'Tỳ bà – bản gốc', level: 'Nâng cao', audioSec: 15 },
        { instrument: 'DTR103', kind: 'LEVEL', name: 'Đàn tranh – luyện tập', level: 'Trung cấp', isHidden: true }
      ]
    },
    {
      title: 'Dạ cổ hoài lang', composer: 'Cao Văn Lầu', genre: 'Nhạc tài tử', isPublic: true,
      description: 'Bản nhạc tiền thân của điệu vọng cổ.',
      sheets: [{ instrument: 'DTR103', kind: 'MAIN', name: 'Đàn tranh – bản gốc', level: 'Trung cấp', audioSec: 16 }]
    },
    {
      title: 'Lý chiều chiều', composer: 'Dân gian', genre: 'Dân ca Trung Bộ', isPublic: true,
      description: 'Dân ca Thừa Thiên Huế.',
      sheets: [{ instrument: 'DSA103', kind: 'MAIN', name: 'Sáo trúc – bản gốc', level: 'Cơ bản', audioSec: 8 }]
    },
    {
      title: 'Lý cây bông', composer: 'Dân gian', genre: 'Dân ca Nam Bộ', isPublic: true,
      description: 'Chưa có bản nhạc công khai – dùng để thử cảnh báo khi công khai bài hát.',
      sheets: []
    },
    {
      title: 'Xuân và tuổi trẻ', composer: 'La Hối', genre: 'Nhạc mới', isPublic: false,
      description: 'Bài hát đang soạn, chưa công khai.',
      sheets: [{ instrument: 'DTR103', kind: 'MAIN', name: 'Đàn tranh – bản nháp', level: 'Trung cấp' }]
    },
    {
      title: 'Hò kéo pháo', composer: 'Dân gian', genre: 'Dân ca Bắc Bộ', isPublic: true,
      description: 'Bài bị admin ẩn – dùng để thử luồng kiểm duyệt và thông báo cho giảng viên.',
      adminHiddenReason: 'Bản thu mẫu đang được kiểm tra bản quyền.',
      sheets: [{ instrument: 'DSA103', kind: 'MAIN', name: 'Sáo trúc – bản gốc', level: 'Trung cấp', audioSec: 10 }]
    }
  ];

  static async seedCatalog(): Promise<void> {
    for (const [legacyCode, code] of Object.entries(DatabaseSeeder.legacyInstrumentCodes)) {
      if (await prisma.instrument.findUnique({ where: { code } })) continue;
      await prisma.instrument.updateMany({ where: { code: legacyCode }, data: { code } });
    }
    for (const instrument of DatabaseSeeder.instruments) {
      const record = await prisma.instrument.upsert({ where: { code: instrument.code }, update: {}, create: instrument });
      const tunes = DatabaseSeeder.instrumentTunes[instrument.code] ?? [];
      const existingTunes = await prisma.instrumentTune.count({ where: { instrumentId: record.id } });
      if (existingTunes === 0 && tunes.length > 0) {
        await prisma.instrumentTune.createMany({
          data: tunes.map((tune) => ({ instrumentId: record.id, tuneName: tune.tuneName, pitch: tune.pitch, displayOrder: tune.displayOrder }))
        });
      }
    }
    for (const [type, names] of [['GENRE', DatabaseSeeder.genres], ['LEVEL', DatabaseSeeder.levels]] as const) {
      for (const [displayOrder, name] of names.entries()) {
        await prisma.category.upsert({
          where: { type_name: { type, name } },
          update: {},
          create: { type, name, displayOrder: displayOrder + 1 }
        });
      }
    }
    for (const [key, { value, label }] of Object.entries(DatabaseSeeder.systemConfig)) {
      await prisma.systemConfig.upsert({ where: { key }, update: {}, create: { key, value, label, valueType: 'NUMBER', group: 'FILE_LIMIT' } });
    }
    for (const { key, value, label, group } of DatabaseSeeder.ruleConfig) {
      await prisma.systemConfig.upsert({ where: { key }, update: {}, create: { key, value, label, valueType: 'NUMBER', group } });
    }
    const { SEMESTERS, AT_RISK_MARGIN } = PlatformConstant.settingKeys;
    const semester = PlatformConstant.semesterConfig;
    await prisma.systemConfig.upsert({
      where: { key: SEMESTERS },
      update: {},
      create: { key: SEMESTERS, value: JSON.stringify(DatabaseSeeder.semesters), valueType: semester.valueType, group: semester.group, label: semester.label, description: semester.description }
    });
    const margin = PlatformConstant.atRiskMarginConfig;
    await prisma.systemConfig.upsert({
      where: { key: AT_RISK_MARGIN },
      update: {},
      create: { key: AT_RISK_MARGIN, value: '10', valueType: margin.valueType, group: margin.group, label: margin.label, description: margin.description }
    });
  }

  static async seedUsers() {
    const seededUsers = [];
    for (const user of DatabaseSeeder.users) {
      seededUsers.push(await prisma.user.upsert({ where: { email: user.email }, update: {}, create: user }));
    }
    return seededUsers;
  }

  static async storeMedia(kind: MediaKind, fileName: string, mimeType: string, content: Buffer, uploadedById: string, extra: Partial<Prisma.MediaFileUncheckedCreateInput>) {
    const extension = fileName.split('.').pop();
    const storageKey = `seed/${kind.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
    await StorageService.driver.putObject(storageKey, content);
    return prisma.mediaFile.create({
      data: { kind, status: 'READY', storageKey, originalName: fileName, mimeType, sizeBytes: content.length, uploadedById, ...extra }
    });
  }

  static async seedPieces(lecturerId: string): Promise<void> {
    const existingTitles = new Set((await prisma.piece.findMany({ where: { ownerId: lecturerId }, select: { title: true } })).map(({ title }) => title));
    const instruments = await prisma.instrument.findMany();
    const categories = await prisma.category.findMany();
    const findInstrumentId = (code: string) => instruments.find((instrument) => instrument.code === code)!.id;
    const findCategoryId = (name: string) => categories.find((category) => category.name === name)!.id;

    let createdCount = 0;
    for (const [pieceIndex, pieceSeed] of DatabaseSeeder.pieces.entries()) {
      if (existingTitles.has(pieceSeed.title)) continue;
      const coverFile = pieceSeed.hasCover
        ? await DatabaseSeeder.storeMedia('COVER', 'cover.png', 'image/png', SampleMediaFactory.tinyPng, lecturerId, {})
        : null;
      const piece = await prisma.piece.create({
        data: {
          ownerId: lecturerId,
          title: pieceSeed.title,
          composer: pieceSeed.composer,
          description: pieceSeed.description,
          genreId: findCategoryId(pieceSeed.genre),
          visibility: pieceSeed.isPublic ? 'PUBLIC' : 'HIDDEN',
          moderation: pieceSeed.adminHiddenReason ? 'ADMIN_HIDDEN' : 'NORMAL',
          moderationReason: pieceSeed.adminHiddenReason ?? null,
          coverFileId: coverFile?.id,
          titleNormalized: TextNormalizer.normalize(pieceSeed.title),
          composerNormalized: TextNormalizer.normalize(pieceSeed.composer),
          searchText: TextNormalizer.normalize(`${pieceSeed.title} ${pieceSeed.composer} ${pieceSeed.description}`),
          createdAt: new Date(Date.now() - (DatabaseSeeder.pieces.length - pieceIndex) * 86_400_000)
        }
      });
      for (const sheetSeed of pieceSeed.sheets) await DatabaseSeeder.seedSheet(piece.id, pieceSeed.title, sheetSeed, lecturerId, findInstrumentId, findCategoryId);
      createdCount += 1;
    }
    console.log(createdCount > 0 ? `Seeded ${createdCount} demo pieces.` : 'Demo pieces already exist – skipped.');
  }

  static async seedSheet(
    pieceId: string,
    pieceTitle: string,
    sheetSeed: SheetSeed,
    lecturerId: string,
    findInstrumentId: (code: string) => string,
    findCategoryId: (name: string) => string
  ): Promise<void> {
    const asciiTitle = TextNormalizer.normalize(`${pieceTitle} ${sheetSeed.name}`).replace(/[^\x20-\x7e]/g, '-');
    const sheetFile = await DatabaseSeeder.storeMedia('SHEET', 'ban-nhac.pdf', 'application/pdf', await SampleMediaFactory.createPdf(asciiTitle, 2), lecturerId, { pageCount: 2 });
    const audioFile = sheetSeed.audioSec
      ? await DatabaseSeeder.storeMedia('AUDIO', 'ban-thu-mau.wav', 'audio/wav', SampleMediaFactory.createWav(sheetSeed.audioSec), lecturerId, { durationSec: sheetSeed.audioSec })
      : null;
    const instrumentId = findInstrumentId(sheetSeed.instrument);
    const isMainWithAudio = sheetSeed.kind === 'MAIN' && audioFile;
    await prisma.sheetMusic.create({
      data: {
        pieceId,
        instrumentId,
        kind: sheetSeed.kind,
        mainInstrumentId: sheetSeed.kind === 'MAIN' ? instrumentId : null,
        name: sheetSeed.name,
        levelId: findCategoryId(sheetSeed.level),
        sheetFileId: sheetFile.id,
        referenceAudioId: audioFile?.id,
        durationSec: audioFile?.durationSec,
        visibility: sheetSeed.isHidden || (sheetSeed.kind === 'MAIN' && !audioFile) ? 'HIDDEN' : 'PUBLIC',
        analysisStatus: isMainWithAudio ? 'READY' : 'NONE',
        analysisFileUrl: isMainWithAudio ? `mock://analysis/seed/${crypto.randomUUID()}.json` : null,
        uploaderId: lecturerId
      }
    });
  }

  static printDevTokens(users: Backend.UserRecord[]): void {
    if (!EnvConfig.jwtSecret || EnvConfig.nodeEnv === 'production') return;
    console.log('\nDev access tokens (valid for JWT_EXPIRES_IN):');
    users.forEach((user) => console.log(`  ${user.email} (role ${user.role}): ${AuthService.createAccessToken(user)}`));
  }

  static async run(): Promise<void> {
    await DatabaseSeeder.seedCatalog();
    const users = await DatabaseSeeder.seedUsers();
    await DatabaseSeeder.seedPieces(users[0].id);
    await FaqSeeder.run();
    DatabaseSeeder.printDevTokens(users);
  }
}

DatabaseSeeder.run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
