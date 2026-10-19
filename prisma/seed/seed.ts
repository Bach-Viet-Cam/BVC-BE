import crypto from 'node:crypto';
import type { MediaKind, Prisma } from '@prisma/client';
import EnvConfig from '../../src/config/EnvConfig.ts';
import PrismaClientProvider from '../../src/config/PrismaClient.ts';
import StorageService from '../../src/lib/storage/StorageService.ts';
import AuthService from '../../src/modules/auth/service/AuthService.ts';
import AuthConstant from '../../src/modules/auth/constant/AuthConstant.ts';
import TextNormalizer from '../../src/utils/TextNormalizer.ts';
import SampleMediaFactory from './SampleMediaFactory.ts';

interface SheetSeed { instrument: string; kind: 'MAIN' | 'LEVEL'; name: string; level: string; audioSec?: number; isHidden?: boolean; }
interface PieceSeed {
  title: string;
  composer: string;
  description: string;
  genre: string;
  level: string;
  instruments: string[];
  isPublic: boolean;
  hasCover?: boolean;
  sheets: SheetSeed[];
}

const prisma = PrismaClientProvider.instance;

export default class DatabaseSeeder {
  static readonly instruments = [
    { code: 'DAN_TRANH', name: 'Đàn tranh', fminHz: 98, fmaxHz: 1568, toleranceCents: 30, description: 'Đàn 16 dây gảy bằng móng.' },
    { code: 'DAN_BAU', name: 'Đàn bầu', fminHz: 65, fmaxHz: 1047, toleranceCents: 35, description: 'Đàn một dây, kỹ thuật bồi âm.' },
    { code: 'SAO_TRUC', name: 'Sáo trúc', fminHz: 261, fmaxHz: 2093, toleranceCents: 30, description: 'Sáo ngang làm từ ống trúc.' },
    { code: 'TY_BA', name: 'Tỳ bà', fminHz: 110, fmaxHz: 1760, toleranceCents: 30, description: 'Đàn 4 dây hình quả lê.' }
  ];

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

  static readonly users = [
    { email: 'giangvien.demo@bvc.local', username: 'Cô Lan (GV demo)', role: AuthConstant.roles.TEACHER },
    { email: 'giangvien2.demo@bvc.local', username: 'Thầy Minh (GV demo 2)', role: AuthConstant.roles.TEACHER },
    { email: 'sinhvien1.demo@bvc.local', username: 'An (SV demo)', role: AuthConstant.roles.STUDENT },
    { email: 'sinhvien2.demo@bvc.local', username: 'Bình (SV demo)', role: AuthConstant.roles.STUDENT }
  ];

  static readonly pieces: PieceSeed[] = [
    {
      title: 'Lý ngựa ô', composer: 'Dân gian', genre: 'Dân ca Nam Bộ', level: 'Cơ bản', isPublic: true, hasCover: true,
      description: 'Làn điệu dân ca Nam Bộ vui tươi, phù hợp làm bài nhập môn.',
      instruments: ['DAN_TRANH', 'SAO_TRUC'],
      sheets: [
        { instrument: 'DAN_TRANH', kind: 'MAIN', name: 'Đàn tranh – bản gốc', level: 'Trung cấp', audioSec: 12 },
        { instrument: 'DAN_TRANH', kind: 'LEVEL', name: 'Đàn tranh – đơn giản', level: 'Cơ bản' },
        { instrument: 'DAN_TRANH', kind: 'LEVEL', name: 'Đàn tranh – luyến láy', level: 'Nâng cao', audioSec: 10 },
        { instrument: 'SAO_TRUC', kind: 'MAIN', name: 'Sáo trúc – bản gốc', level: 'Trung cấp', audioSec: 11 }
      ]
    },
    {
      title: 'Trống cơm', composer: 'Dân gian', genre: 'Dân ca Bắc Bộ', level: 'Cơ bản', isPublic: true,
      description: 'Dân ca quan họ Bắc Ninh với tiết tấu rộn ràng.',
      instruments: ['DAN_BAU', 'SAO_TRUC'],
      sheets: [
        { instrument: 'DAN_BAU', kind: 'MAIN', name: 'Đàn bầu – bản gốc', level: 'Cơ bản', audioSec: 9 },
        { instrument: 'SAO_TRUC', kind: 'LEVEL', name: 'Sáo trúc – nhập môn', level: 'Cơ bản' }
      ]
    },
    {
      title: 'Bèo dạt mây trôi', composer: 'Dân gian', genre: 'Dân ca Bắc Bộ', level: 'Trung cấp', isPublic: true, hasCover: true,
      description: 'Bài dân ca trữ tình, giai điệu chậm, nhiều luyến láy.',
      instruments: ['DAN_BAU', 'DAN_TRANH'],
      sheets: [
        { instrument: 'DAN_BAU', kind: 'MAIN', name: 'Đàn bầu – bản gốc', level: 'Trung cấp', audioSec: 14 },
        { instrument: 'DAN_TRANH', kind: 'MAIN', name: 'Đàn tranh – bản gốc', level: 'Trung cấp', audioSec: 13 },
        { instrument: 'DAN_TRANH', kind: 'LEVEL', name: 'Đàn tranh – rút gọn', level: 'Cơ bản' }
      ]
    },
    {
      title: 'Lưu thủy kim tiền', composer: 'Dân gian', genre: 'Nhạc tài tử', level: 'Nâng cao', isPublic: true,
      description: 'Bài bản nhạc tài tử Nam Bộ.',
      instruments: ['DAN_TRANH', 'TY_BA'],
      sheets: [
        { instrument: 'TY_BA', kind: 'MAIN', name: 'Tỳ bà – bản gốc', level: 'Nâng cao', audioSec: 15 },
        { instrument: 'DAN_TRANH', kind: 'LEVEL', name: 'Đàn tranh – luyện tập', level: 'Trung cấp', isHidden: true }
      ]
    },
    {
      title: 'Dạ cổ hoài lang', composer: 'Cao Văn Lầu', genre: 'Nhạc tài tử', level: 'Trung cấp', isPublic: true,
      description: 'Bản nhạc tiền thân của điệu vọng cổ.',
      instruments: ['DAN_TRANH'],
      sheets: [{ instrument: 'DAN_TRANH', kind: 'MAIN', name: 'Đàn tranh – bản gốc', level: 'Trung cấp', audioSec: 16 }]
    },
    {
      title: 'Lý chiều chiều', composer: 'Dân gian', genre: 'Dân ca Trung Bộ', level: 'Cơ bản', isPublic: true,
      description: 'Dân ca Thừa Thiên Huế.',
      instruments: ['SAO_TRUC'],
      sheets: [{ instrument: 'SAO_TRUC', kind: 'MAIN', name: 'Sáo trúc – bản gốc', level: 'Cơ bản', audioSec: 8 }]
    },
    {
      title: 'Lý cây bông', composer: 'Dân gian', genre: 'Dân ca Nam Bộ', level: 'Cơ bản', isPublic: true,
      description: 'Chưa có bản nhạc công khai – dùng để thử cảnh báo khi công khai bài hát.',
      instruments: ['TY_BA'],
      sheets: []
    },
    {
      title: 'Xuân và tuổi trẻ', composer: 'La Hối', genre: 'Nhạc mới', level: 'Trung cấp', isPublic: false,
      description: 'Bài hát đang soạn, chưa công khai.',
      instruments: ['DAN_TRANH'],
      sheets: [{ instrument: 'DAN_TRANH', kind: 'MAIN', name: 'Đàn tranh – bản nháp', level: 'Trung cấp' }]
    }
  ];

  static async seedCatalog(): Promise<void> {
    for (const instrument of DatabaseSeeder.instruments) {
      await prisma.instrument.upsert({ where: { code: instrument.code }, update: {}, create: instrument });
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
    await StorageService.driver.putObject(storageKey, content, mimeType);
    return prisma.mediaFile.create({
      data: { kind, status: 'READY', storageKey, originalName: fileName, mimeType, sizeBytes: content.length, uploadedById, ...extra }
    });
  }

  static async seedPieces(lecturerId: string): Promise<void> {
    if (await prisma.piece.count({ where: { ownerId: lecturerId } }) > 0) {
      console.log('Demo pieces already exist – skipped.');
      return;
    }
    const instruments = await prisma.instrument.findMany();
    const categories = await prisma.category.findMany();
    const findInstrumentId = (code: string) => instruments.find((instrument) => instrument.code === code)!.id;
    const findCategoryId = (name: string) => categories.find((category) => category.name === name)!.id;

    for (const [pieceIndex, pieceSeed] of DatabaseSeeder.pieces.entries()) {
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
          levelId: findCategoryId(pieceSeed.level),
          visibility: pieceSeed.isPublic ? 'PUBLIC' : 'HIDDEN',
          coverFileId: coverFile?.id,
          titleNormalized: TextNormalizer.normalize(pieceSeed.title),
          composerNormalized: TextNormalizer.normalize(pieceSeed.composer),
          searchText: TextNormalizer.normalize(`${pieceSeed.title} ${pieceSeed.composer} ${pieceSeed.description}`),
          createdAt: new Date(Date.now() - (DatabaseSeeder.pieces.length - pieceIndex) * 86_400_000),
          instruments: { create: pieceSeed.instruments.map((code) => ({ instrumentId: findInstrumentId(code) })) }
        }
      });
      for (const sheetSeed of pieceSeed.sheets) await DatabaseSeeder.seedSheet(piece.id, pieceSeed.title, sheetSeed, lecturerId, findInstrumentId, findCategoryId);
    }
    console.log(`Seeded ${DatabaseSeeder.pieces.length} demo pieces.`);
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
    DatabaseSeeder.printDevTokens(users);
  }
}

DatabaseSeeder.run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
