import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.ts';
import PrismaClientProvider from '../../src/config/PrismaClient.ts';
import AuthConstant from '../../src/modules/auth/constant/AuthConstant.ts';
import AuthService from '../../src/modules/auth/service/AuthService.ts';
import SampleMediaFactory from '../../prisma/seed/SampleMediaFactory.ts';

interface TestUser { id: string; token: string; }

export default class TestContext {
  static readonly app: Express = createApp();
  static readonly prisma = PrismaClientProvider.instance;
  static readonly api = '/api/v1';
  static catalog: { instruments: Record<string, string>; genres: Record<string, string>; levels: Record<string, string> };

  static async reset(): Promise<void> {
    await TestContext.prisma.$executeRawUnsafe(`TRUNCATE TABLE saved_item, sheet_music, piece_instrument, pieces, media_file,
      category, instruments, system_configs, auth_sessions, auth_identities, users RESTART IDENTITY CASCADE`);
    await TestContext.seedCatalog();
  }

  static async seedCatalog(): Promise<void> {
    const instrumentRows = [
      { code: 'DAN_TRANH', name: 'Đàn tranh' },
      { code: 'DAN_BAU', name: 'Đàn bầu' },
      { code: 'SAO_TRUC', name: 'Sáo trúc' }
    ];
    const instruments: Record<string, string> = {};
    for (const instrumentRow of instrumentRows) {
      const instrument = await TestContext.prisma.instrument.create({ data: { ...instrumentRow, fminHz: 80, fmaxHz: 2000, toleranceCents: 30 } });
      instruments[instrumentRow.code] = instrument.id;
    }
    const genres: Record<string, string> = {};
    for (const [displayOrder, name] of ['Dân ca Nam Bộ', 'Dân ca Bắc Bộ', 'Nhạc tài tử'].entries()) {
      genres[name] = (await TestContext.prisma.category.create({ data: { type: 'GENRE', name, displayOrder } })).id;
    }
    const levels: Record<string, string> = {};
    for (const [displayOrder, name] of ['Cơ bản', 'Trung cấp', 'Nâng cao'].entries()) {
      levels[name] = (await TestContext.prisma.category.create({ data: { type: 'LEVEL', name, displayOrder } })).id;
    }
    TestContext.catalog = { instruments, genres, levels };
  }

  static async createUser(role: 'LECTURER' | 'STUDENT', email: string): Promise<TestUser> {
    const roleValue = role === 'LECTURER' ? AuthConstant.roles.TEACHER : AuthConstant.roles.STUDENT;
    const user = await TestContext.prisma.user.create({ data: { email, username: email.split('@')[0], role: roleValue } });
    return { id: user.id, token: AuthService.createAccessToken(user) };
  }

  static auth(user: TestUser): Record<string, string> {
    return { Authorization: `Bearer ${user.token}` };
  }

  // presign → PUT bytes to the upload URL (Bearer) → returns the media file id (not yet confirmed)
  static async upload(user: TestUser, kind: MusicLibrary.MediaKind, fileName: string, mimeType: string, content: Buffer): Promise<string> {
    const presignResponse = await request(TestContext.app)
      .post(`${TestContext.api}/uploads/presign`)
      .set(TestContext.auth(user))
      .send({ kind, fileName, mimeType, size: content.length });
    if (presignResponse.status !== 201) throw new Error(`presign failed: ${JSON.stringify(presignResponse.body)}`);
    const { fileId, uploadUrl } = presignResponse.body.data;
    const uploadResponse = await request(TestContext.app).put(new URL(uploadUrl).pathname).set(TestContext.auth(user)).set('Content-Type', mimeType).send(content);
    if (uploadResponse.status !== 200) throw new Error(`upload failed: ${uploadResponse.status}`);
    return fileId;
  }

  static async uploadPdf(user: TestUser, title: string = 'Sheet'): Promise<string> {
    return TestContext.upload(user, 'SHEET', 'ban-nhac.pdf', 'application/pdf', await SampleMediaFactory.createPdf(title, 3));
  }

  static async uploadWav(user: TestUser, durationSec: number = 5): Promise<string> {
    return TestContext.upload(user, 'AUDIO', 'ban-thu.wav', 'audio/wav', SampleMediaFactory.createWav(durationSec));
  }

  static async createPiece(lecturer: TestUser, overrides: Record<string, unknown> = {}) {
    const response = await request(TestContext.app)
      .post(`${TestContext.api}/lecturer/pieces`)
      .set(TestContext.auth(lecturer))
      .send({
        title: 'Lý ngựa ô',
        composer: 'Dân gian',
        description: 'Dân ca Nam Bộ',
        genreId: TestContext.catalog.genres['Dân ca Nam Bộ'],
        ...overrides
      });
    if (response.status !== 201) throw new Error(`create piece failed: ${JSON.stringify(response.body)}`);
    return response.body.data.piece as { id: string; title: string };
  }

  static async createSheet(lecturer: TestUser, pieceId: string, overrides: Record<string, unknown> = {}) {
    const response = await request(TestContext.app)
      .post(`${TestContext.api}/lecturer/pieces/${pieceId}/sheet-music`)
      .set(TestContext.auth(lecturer))
      .send({
        instrumentId: TestContext.catalog.instruments.DAN_TRANH,
        name: `Bản ${Math.random().toString(36).slice(2, 8)}`,
        levelId: TestContext.catalog.levels['Cơ bản'],
        sheetFileId: overrides.sheetFileId ?? await TestContext.uploadPdf(lecturer),
        ...overrides
      });
    return response;
  }

  // A public piece with a public main sheet (with recording) for DAN_TRANH
  static async createPublishedPiece(lecturer: TestUser, overrides: Record<string, unknown> = {}, sheetOverrides: Record<string, unknown> = {}) {
    const piece = await TestContext.createPiece(lecturer, overrides);
    const sheetResponse = await TestContext.createSheet(lecturer, piece.id, {
      name: 'Bản chính',
      referenceAudioId: await TestContext.uploadWav(lecturer, 6),
      visibility: 'PUBLIC',
      ...sheetOverrides
    });
    if (sheetResponse.status !== 201) throw new Error(`create sheet failed: ${JSON.stringify(sheetResponse.body)}`);
    await request(TestContext.app)
      .patch(`${TestContext.api}/lecturer/pieces/${piece.id}/visibility`)
      .set(TestContext.auth(lecturer))
      .send({ visibility: 'PUBLIC' });
    return { piece, mainSheet: sheetResponse.body.data as { id: string } };
  }
}
