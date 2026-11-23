import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from '../../support/TestContext.ts';
import F from './MusicLibraryFixture.ts';

type TestUser = Awaited<ReturnType<typeof TestContext.createUser>>;
type SheetItem = { id: string; name: string; canManage: boolean; usesMainRecording: boolean; durationSec: number | null; analysis: unknown };
type SheetGroup = { instrument: { name: string }; count: number; items: SheetItem[] };
const { prisma } = TestContext;
const M = F.messages;

describe('Report 5.2 – Sheet Music Management (UC-06)', () => {
  let gvA: TestUser;
  let gvB: TestUser;
  let gvC: TestUser;
  let sv1: TestUser;
  let tranh: string;
  let bau: string;
  let sao: string;
  let coBan: string;
  let nangCao: string;

  beforeEach(async () => {
    await TestContext.reset();
    gvA = await TestContext.createUser('LECTURER', 'gv.a@test.local');
    gvB = await TestContext.createUser('LECTURER', 'gv.b@test.local');
    gvC = await TestContext.createUser('LECTURER', 'gv.c@test.local');
    sv1 = await TestContext.createUser('STUDENT', 'sv.1@test.local');
    tranh = F.instrument('DAN_TRANH');
    bau = F.instrument('DAN_BAU');
    sao = F.instrument('SAO_TRUC');
    coBan = F.level('Cơ bản');
    nangCao = F.level('Nâng cao');
  });

  const songP1 = () => TestContext.createPiece(gvA);
  const sheetUrl = (pieceId: string) => `/lecturer/pieces/${pieceId}/sheet-music`;
  const allItems = (groups: SheetGroup[]) => groups.flatMap((group) => group.items);
  const option = (options: Array<{ name: string }>, name: string) => options.find((item) => item.name === name);

  // ITC-SH-001 state: $P1 with the Đàn tranh main sheet "Bản 1" ($S1, 6-second recording)
  async function withMainSheet() {
    const piece = await songP1();
    const sheetFileId = await F.pdf(gvA, 3, false);
    const audioId = await F.wav(gvA, 6, false);
    const response = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 1', levelId: coBan, sheetFileId, referenceAudioId: audioId }, gvA);
    return { piece, sheetFileId, audioId, response, mainSheetId: response.body.data?.id as string };
  }

  // ITC-SH-002 state: plus the Đàn tranh level sheet "Bản 2" ($S2)
  async function withLevelSheet() {
    const state = await withMainSheet();
    const levelFileId = await F.pdf(gvA, 2);
    const response = await F.post(sheetUrl(state.piece.id), { instrumentId: tranh, name: 'Bản 2', levelId: coBan, sheetFileId: levelFileId }, gvA);
    return { ...state, levelResponse: response, levelSheetId: response.body.data?.id as string };
  }

  // ITC-SH-009 state: GV-B added "Bản của B" ($SB) to GV-A's song $P1; contributors can only add to a public song
  async function withContributorSheet() {
    const piece = await songP1();
    await F.setPieceVisibility(gvA, piece.id, 'PUBLIC');
    const contributorFileId = await F.pdf(gvB);
    const response = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản của B', levelId: coBan, sheetFileId: contributorFileId }, gvB);
    return { piece, response, contributorSheetId: response.body.data?.id as string };
  }

  describe('Create a sheet (POST /api/v1/lecturer/pieces/:id/sheet-music)', () => {
    it('ITC-SH-001 first sheet of an instrument is MAIN, public with a recording, analysis job sent', async () => {
      const { response, mainSheetId, sheetFileId, audioId } = await withMainSheet();
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Thêm bản nhạc thành công.');
      expect(response.body.data).toMatchObject({
        kind: 'MAIN', isMain: true, visibility: 'PUBLIC', durationSec: 6, canManage: true, canPublish: true, usesMainRecording: false,
        files: { sheet: { pageCount: 3 }, audio: { durationSec: 6 } }
      });
      expect(response.body.data.analysis).toMatchObject({ status: 'ERROR', error: M.analysisSendFailed });

      const stored = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheetId } });
      expect([stored.kind, stored.mainInstrumentId, stored.uploaderId]).toEqual(['MAIN', tranh, gvA.id]);
      const files = await prisma.mediaFile.findMany({ where: { id: { in: [sheetFileId, audioId] } } });
      expect(files.map((file) => file.status)).toEqual(['READY', 'READY']);
    });

    it('ITC-SH-002 a second sheet of the same instrument without kind is LEVEL', async () => {
      const { levelResponse } = await withLevelSheet();
      expect(levelResponse.status).toBe(201);
      expect(levelResponse.body.data).toMatchObject({ kind: 'LEVEL', isMain: false, visibility: 'PUBLIC', usesMainRecording: true, analysis: null });
    });

    it('ITC-SH-003 a second MAIN sheet for the same instrument is blocked (GBR-55)', async () => {
      const { piece } = await withLevelSheet();
      const extraFileId = await F.pdf(gvA, 2);
      const response = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 3', levelId: coBan, sheetFileId: extraFileId, kind: 'MAIN' }, gvA);
      F.expectError(response, 409, { code: 'MSG-08', field: 'kind', message: M.mainExists });
      expect(await prisma.sheetMusic.count({ where: { pieceId: piece.id } })).toBe(2);
      expect(await prisma.sheetMusic.count({ where: { sheetFileId: extraFileId } })).toBe(0);
      expect(await prisma.mediaFile.findUnique({ where: { id: extraFileId } })).not.toBeNull();
    });

    it('ITC-SH-004 suggested sheet kind per instrument (GBR-55)', async () => {
      const { piece } = await withLevelSheet();
      const response = await F.get(sheetUrl(piece.id), gvA);
      expect(response.status).toBe(200);
      const options = response.body.data.instrumentOptions;
      expect(option(options, 'Đàn tranh')).toMatchObject({ hasMain: true, defaultKind: 'LEVEL' });
      expect(option(options, 'Đàn bầu')).toMatchObject({ hasMain: false, defaultKind: 'MAIN' });
      expect(option(options, 'Sáo trúc')).toMatchObject({ hasMain: false, defaultKind: 'MAIN' });
    });

    it('ITC-SH-005 a main sheet without recording is saved hidden but cannot be published (GBR-43)', async () => {
      const piece = await songP1();
      const created = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản chính', levelId: coBan, sheetFileId: await F.pdf(gvA) }, gvA);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ isMain: true, visibility: 'HIDDEN', canPublish: false, files: { audio: null } });

      const publish = await F.patch(`/lecturer/sheet-music/${created.body.data.id}/visibility`, { visibility: 'PUBLIC' }, gvA);
      F.expectError(publish, 409, { code: 'MSG-08', field: 'visibility', message: M.mainNeedsAudio });

      const publicOnCreate = await F.post(sheetUrl(piece.id), { instrumentId: sao, name: 'Bản chính Sáo', levelId: coBan, sheetFileId: await F.pdf(gvA, 2), visibility: 'PUBLIC' }, gvA);
      F.expectError(publicOnCreate, 409, { code: 'MSG-08', field: 'visibility', message: M.mainNeedsAudio });
    });

    it('ITC-SH-006 song instruments come from its sheets in order; the form lists every active instrument', async () => {
      const piece = await songP1();
      expect((await F.get(`/lecturer/pieces/${piece.id}`, gvA)).body.data.instruments).toEqual([]);

      await F.createSheetOrThrow(gvA, piece.id, { name: 'Bản bầu', instrumentId: bau });
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Bản tranh', instrumentId: tranh });

      const detail = await F.get(`/lecturer/pieces/${piece.id}`, gvA);
      expect(detail.status).toBe(200);
      expect(detail.body.data.instruments.map((instrument: { name: string }) => instrument.name)).toEqual(['Đàn bầu', 'Đàn tranh']);

      const list = await F.get(sheetUrl(piece.id), gvA);
      expect(list.status).toBe(200);
      expect(list.body.data.instrumentOptions.map((item: { name: string }) => item.name).sort()).toEqual(['Đàn bầu', 'Đàn tranh', 'Sáo trúc'].sort());
    });

    it('ITC-SH-007 an inactive instrument cannot be chosen (GBR-44)', async () => {
      const piece = await songP1();
      await prisma.instrument.update({ where: { id: bau }, data: { isActive: false } });
      const response = await F.post(sheetUrl(piece.id), { instrumentId: bau, name: 'Bản bầu', levelId: coBan, sheetFileId: await F.pdf(gvA) }, gvA);
      F.expectError(response, 400, { code: 'MSG-08', field: 'instrumentId', message: M.inactiveCategory });
    });

    it('ITC-SH-008 duplicate "Tên bản" in the same song (case-insensitive) → MSG-05; another song is fine', async () => {
      const piece1 = await songP1();
      const piece2 = await TestContext.createPiece(gvA, { title: 'Trống cơm' });
      await F.createSheetOrThrow(gvA, piece1.id, { name: 'Bản dễ', instrumentId: tranh });

      const duplicate = await F.post(sheetUrl(piece1.id), { instrumentId: sao, name: 'BẢN DỄ', levelId: coBan, sheetFileId: await F.pdf(gvA) }, gvA);
      F.expectError(duplicate, 409, { code: 'MSG-05', field: 'name', message: M.duplicateSheetName });

      const otherSong = await F.post(sheetUrl(piece2.id), { instrumentId: tranh, name: 'Bản dễ', levelId: coBan, sheetFileId: await F.pdf(gvA) }, gvA);
      expect(otherSong.status).toBe(201);
      expect(otherSong.body.data.name).toBe('Bản dễ');
    });

    it('ITC-SH-017 "Tên bản" length bounds (100 / 101)', async () => {
      const piece = await songP1();
      const sheetFileId = await F.pdf(gvA);
      const tooLong = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'a'.repeat(101), levelId: coBan, sheetFileId }, gvA);
      F.expectError(tooLong, 400, { code: 'MSG-37', field: 'name', message: 'Tên bản không được vượt quá 100 ký tự.' });
      const atLimit = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'a'.repeat(100), levelId: coBan, sheetFileId }, gvA);
      expect(atLimit.status).toBe(201);
      expect(atLimit.body.data.name).toHaveLength(100);
    });

    it('ITC-SH-018 missing sheet file / level and a long description are stopped by Zod', async () => {
      const piece = await songP1();
      const sheetFileId = await F.pdf(gvA);
      F.expectError(await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 1', levelId: coBan }, gvA), 400,
        { code: 'MSG-35', field: 'sheetFileId', message: 'File bản nhạc không được để trống.' });
      F.expectError(await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 1', sheetFileId }, gvA), 400,
        { code: 'MSG-35', field: 'levelId', message: 'Trình độ không được để trống.' });
      F.expectError(await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 1', levelId: coBan, sheetFileId, description: 'a'.repeat(501) }, gvA), 400,
        { code: 'MSG-37', field: 'description', message: 'Mô tả không được vượt quá 500 ký tự.' });
    });

    it('ITC-SH-019 an inactive level cannot be chosen (GBR-44)', async () => {
      const piece = await songP1();
      await prisma.category.update({ where: { id: nangCao }, data: { status: 'INACTIVE' } });
      const response = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản khó', levelId: nangCao, sheetFileId: await F.pdf(gvA) }, gvA);
      F.expectError(response, 400, { code: 'MSG-08', field: 'levelId', message: M.inactiveCategory });
    });

    it('ITC-SH-020 adding a sheet to an unknown song → 404', async () => {
      const response = await F.post(sheetUrl(F.zeroId), { instrumentId: tranh, name: 'Bản 1', levelId: coBan, sheetFileId: await F.pdf(gvA) }, gvA);
      F.expectError(response, 404, { code: 'MSG-08', message: M.pieceNotFound });
    });

    it('ITC-SH-021 a sheet file uploaded by another lecturer cannot be used', async () => {
      const piece = await songP1();
      const response = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 1', levelId: coBan, sheetFileId: await F.pdf(gvB) }, gvA);
      F.expectError(response, 400, { code: 'MSG-08', field: 'sheetFileId', message: M.fileNotOwned });
    });

    it('ITC-SH-022 audio in the sheet slot / PDF in the audio slot is rejected per slot', async () => {
      const piece = await songP1();
      const sheetFileId = await F.pdf(gvA);
      const audioId = await F.wav(gvA, 6);
      F.expectError(await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 1', levelId: coBan, sheetFileId: audioId }, gvA), 400,
        { code: 'MSG-08', field: 'sheetFileId', message: M.wrongSlot });
      F.expectError(await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản 1', levelId: coBan, sheetFileId, referenceAudioId: sheetFileId }, gvA), 400,
        { code: 'MSG-08', field: 'referenceAudioId', message: M.wrongSlot });
    });

    it('ITC-SH-023 a main sheet with recording sends an analysis job and stores its state', async () => {
      const piece = await songP1();
      const response = await F.post(sheetUrl(piece.id), {
        instrumentId: tranh, name: 'Bản chính', levelId: coBan, sheetFileId: await F.pdf(gvA), referenceAudioId: await F.wav(gvA, 6)
      }, gvA);
      expect(response.status).toBe(201);
      expect(response.body.data.analysis).toMatchObject({ status: 'ERROR', error: M.analysisSendFailed });
      const stored = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: response.body.data.id } });
      expect(stored.analysisJobId).not.toBeNull();
      expect([stored.analysisStatus, stored.analysisError]).toEqual(['ERROR', M.analysisSendFailed]);
    });

    it('ITC-SH-024 a tutorial video can be attached on create', async () => {
      const piece = await songP1();
      const videoId = await F.video(gvA);
      const response = await F.post(sheetUrl(piece.id), { instrumentId: tranh, name: 'Bản chính', levelId: coBan, sheetFileId: await F.pdf(gvA), tutorialVideoId: videoId }, gvA);
      expect(response.status).toBe(201);
      expect(response.body.data.files.video).toMatchObject({ id: videoId, mimeType: 'video/mp4' });
      expect(response.body.data.visibility).toBe('HIDDEN');
    });

    it('ITC-SH-025 adding a sheet moves the song to the top of the lecturer list', async () => {
      const piece1 = await songP1();
      await F.pause();
      await TestContext.createPiece(gvA, { title: 'Trống cơm' });
      expect(F.titles(await F.get('/lecturer/pieces', gvA))).toEqual(['Trống cơm', 'Lý ngựa ô']);
      await F.pause();
      await F.createSheetOrThrow(gvA, piece1.id, { name: 'Bản 1', instrumentId: tranh });
      expect(F.titles(await F.get('/lecturer/pieces', gvA))).toEqual(['Lý ngựa ô', 'Trống cơm']);
    });
  });

  describe('View a sheet (GET /api/v1/lecturer/sheet-music/:id)', () => {
    it('ITC-SH-026 a lecturer without manage rights reads the sheet with canManage = false', async () => {
      const { mainSheetId } = await withMainSheet();
      const response = await F.get(`/lecturer/sheet-music/${mainSheetId}`, gvC);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: mainSheetId, canManage: false, canChangeVisibility: false, canPublish: true });
    });

    it('ITC-SH-027 unknown sheet id → 404 MSG-08', async () => {
      F.expectError(await F.get(`/lecturer/sheet-music/${F.zeroId}`, gvA), 404, { code: 'MSG-08', message: M.sheetNotFound });
    });
  });

  describe('Edit a sheet (PUT /api/v1/lecturer/sheet-music/:id)', () => {
    it('ITC-SH-028 switching a main sheet to LEVEL clears the analysis data', async () => {
      const { piece, mainSheetId } = await withMainSheet();
      const response = await F.put(`/lecturer/sheet-music/${mainSheetId}`, { kind: 'LEVEL' }, gvA);
      expect(response.status).toBe(200);
      const stored = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheetId } });
      expect([stored.mainInstrumentId, stored.analysisStatus, stored.analysisJobId]).toEqual([null, 'NONE', null]);
      const list = await F.get(sheetUrl(piece.id), gvA);
      expect(option(list.body.data.instrumentOptions, 'Đàn tranh')).toMatchObject({ hasMain: false, defaultKind: 'MAIN' });
    });

    it('ITC-SH-029 LEVEL → MAIN is blocked when the instrument already has a main sheet', async () => {
      const { levelSheetId } = await withLevelSheet();
      F.expectError(await F.put(`/lecturer/sheet-music/${levelSheetId}`, { kind: 'MAIN' }, gvA), 409, { code: 'MSG-08', field: 'kind', message: M.mainExists });
    });

    it('ITC-SH-030 renaming to another sheet name (other case) → MSG-05; keeping the same name is fine', async () => {
      const { levelSheetId } = await withLevelSheet();
      F.expectError(await F.put(`/lecturer/sheet-music/${levelSheetId}`, { name: 'bản 1' }, gvA), 409, { code: 'MSG-05', field: 'name', message: M.duplicateSheetName });
      const sameName = await F.put(`/lecturer/sheet-music/${levelSheetId}`, { name: 'Bản 2', description: 'Tay trái giữ nhịp' }, gvA);
      expect(sameName.status).toBe(200);
      expect(sameName.body.data).toMatchObject({ name: 'Bản 2', description: 'Tay trái giữ nhịp' });
    });

    it('ITC-SH-031 a public LEVEL sheet without recording cannot become MAIN while public (GBR-43)', async () => {
      const piece = await songP1();
      const levelSheet = await F.createSheetOrThrow(gvA, piece.id, { name: 'Bản dễ', instrumentId: sao, kind: 'LEVEL', visibility: 'PUBLIC' });
      F.expectError(await F.put(`/lecturer/sheet-music/${levelSheet.id}`, { kind: 'MAIN' }, gvA), 409, { code: 'MSG-08', field: 'visibility', message: M.mainNeedsAudio });
      const hiddenMain = await F.put(`/lecturer/sheet-music/${levelSheet.id}`, { kind: 'MAIN', visibility: 'HIDDEN' }, gvA);
      expect(hiddenMain.status).toBe(200);
      expect(hiddenMain.body.data).toMatchObject({ kind: 'MAIN', visibility: 'HIDDEN', canPublish: false });
    });

    it('ITC-SH-032 switching to an inactive instrument is blocked; renaming on an inactive instrument works', async () => {
      const { levelSheetId } = await withLevelSheet();
      await prisma.instrument.update({ where: { id: bau }, data: { isActive: false } });
      F.expectError(await F.put(`/lecturer/sheet-music/${levelSheetId}`, { instrumentId: bau }, gvA), 400, { code: 'MSG-08', field: 'instrumentId', message: M.inactiveCategory });
      await prisma.instrument.update({ where: { id: tranh }, data: { isActive: false } });
      const renamed = await F.put(`/lecturer/sheet-music/${levelSheetId}`, { name: 'Bản 2 (sửa)' }, gvA);
      expect(renamed.status).toBe(200);
      expect(renamed.body.data).toMatchObject({ name: 'Bản 2 (sửa)', instrument: { id: tranh } });
    });

    it('ITC-SH-033 a sheet keeps its inactive level but cannot switch to another inactive level (GBR-44)', async () => {
      const { levelSheetId } = await withLevelSheet();
      await prisma.category.updateMany({ where: { id: { in: [coBan, nangCao] } }, data: { status: 'INACTIVE' } });
      const keep = await F.put(`/lecturer/sheet-music/${levelSheetId}`, { levelId: coBan, name: 'Bản 2' }, gvA);
      expect(keep.status).toBe(200);
      expect(keep.body.data.level.id).toBe(coBan);
      F.expectError(await F.put(`/lecturer/sheet-music/${levelSheetId}`, { levelId: nangCao }, gvA), 400, { code: 'MSG-08', field: 'levelId', message: M.inactiveCategory });
    });
  });

  describe('Sheet manage rights (R-01)', () => {
    it('ITC-SH-009 another lecturer adds a sheet to GV-A song; a third lecturer sees canManage = false', async () => {
      const { piece, response, contributorSheetId } = await withContributorSheet();
      expect(response.status).toBe(201);
      expect(response.body.data.canManage).toBe(true);
      expect((await prisma.sheetMusic.findUniqueOrThrow({ where: { id: contributorSheetId } })).uploaderId).toBe(gvB.id);

      const list = await F.get(sheetUrl(piece.id), gvC);
      expect(list.status).toBe(200);
      expect(allItems(list.body.data.groups).find((item) => item.name === 'Bản của B')?.canManage).toBe(false);
    });

    it('ITC-SH-010 only the uploader and the song owner edit the sheet; the uploader cannot change song visibility', async () => {
      const { piece, contributorSheetId } = await withContributorSheet();
      F.expectForbidden(await F.put(`/lecturer/sheet-music/${contributorSheetId}`, { name: 'Bản của C' }, gvC));
      const byUploader = await F.put(`/lecturer/sheet-music/${contributorSheetId}`, { name: 'Bản của B (sửa)' }, gvB);
      expect(byUploader.status).toBe(200);
      expect(byUploader.body.data.name).toBe('Bản của B (sửa)');
      expect((await F.put(`/lecturer/sheet-music/${contributorSheetId}`, { name: 'Bản của B (chủ bài sửa)' }, gvA)).status).toBe(200);
      F.expectError(await F.setPieceVisibility(gvB, piece.id, 'PUBLIC'), 403, { code: 'MSG-08', message: M.pieceNotOwner });
    });
  });

  describe('Show / hide a sheet (PATCH /api/v1/lecturer/sheet-music/:id/visibility)', () => {
    it('ITC-SH-011 admin-hidden sheet: the lecturer cannot change its visibility (GBR-45)', async () => {
      const { mainSheetId } = await withMainSheet();
      await prisma.sheetMusic.update({ where: { id: mainSheetId }, data: { moderation: 'ADMIN_HIDDEN' } });
      F.expectError(await F.patch(`/lecturer/sheet-music/${mainSheetId}/visibility`, { visibility: 'HIDDEN' }, gvA), 409,
        { code: 'MSG-08', field: 'visibility', message: M.adminHiddenSheet });
      const detail = await F.get(`/lecturer/sheet-music/${mainSheetId}`, gvA);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ effectiveVisibility: 'ADMIN_HIDDEN', canChangeVisibility: false, canPublish: false });
    });

    it('ITC-SH-034 hiding the main sheet removes the tab and closes the viewer', async () => {
      const { piece, mainSheet } = await TestContext.createPublishedPiece(gvA);
      const hidden = await F.patch(`/lecturer/sheet-music/${mainSheet.id}/visibility`, { visibility: 'HIDDEN' }, gvA);
      expect(hidden.status).toBe(200);
      expect(hidden.body.message).toBe('Ẩn bản nhạc thành công.');
      expect(hidden.body.data.visibility).toBe('HIDDEN');

      const detail = await F.get(`/library/pieces/${piece.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ instrumentCount: 0, tabs: [], defaultInstrumentId: null });
      F.expectError(await F.get(`/library/sheet-music/${mainSheet.id}`), 404, { code: 'MSG-08', message: M.sheetNotPublic });

      const shown = await F.patch(`/lecturer/sheet-music/${mainSheet.id}/visibility`, { visibility: 'PUBLIC' }, gvA);
      expect(shown.status).toBe(200);
      expect(shown.body.message).toBe('Hiện bản nhạc thành công.');
    });

    it('ITC-SH-035 a lecturer without manage rights cannot change sheet visibility', async () => {
      const { mainSheetId } = await withMainSheet();
      F.expectForbidden(await F.patch(`/lecturer/sheet-music/${mainSheetId}/visibility`, { visibility: 'HIDDEN' }, gvC));
    });

    it('ITC-SH-036 a LEVEL sheet without recording can be public (uses the main recording)', async () => {
      const { levelSheetId } = await withLevelSheet();
      expect((await F.patch(`/lecturer/sheet-music/${levelSheetId}/visibility`, { visibility: 'HIDDEN' }, gvA)).status).toBe(200);
      const shown = await F.patch(`/lecturer/sheet-music/${levelSheetId}/visibility`, { visibility: 'PUBLIC' }, gvA);
      expect(shown.status).toBe(200);
      expect(shown.body.data).toMatchObject({ visibility: 'PUBLIC', usesMainRecording: true });
    });
  });

  describe('Replace a sheet file (PUT /api/v1/lecturer/sheet-music/:id/files/:slot)', () => {
    it('ITC-SH-012 replacing the sheet file keeps the id, deletes the old file, saved item still points to it', async () => {
      const { piece, mainSheet } = await TestContext.createPublishedPiece(gvA);
      expect((await F.put(`/me/saved/sheet-music/${mainSheet.id}`, {}, sv1)).status).toBe(200);
      const oldSheet = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheet.id }, include: { sheetFile: true } });
      const newFileId = await F.pdf(gvA);

      const replaced = await F.put(`/lecturer/sheet-music/${mainSheet.id}/files/sheet`, { fileId: newFileId }, gvA);
      expect(replaced.status).toBe(200);
      expect(replaced.body.message).toBe('Cập nhật file thành công.');
      expect(replaced.body.data).toMatchObject({ id: mainSheet.id, files: { sheet: { id: newFileId, pageCount: 3 } } });

      expect(await prisma.mediaFile.findUnique({ where: { id: oldSheet.sheetFileId } })).toBeNull();
      expect(F.storedFileExists(oldSheet.sheetFile.storageKey)).toBe(false);

      const saved = await F.get('/me/saved?type=SHEET_MUSIC', sv1);
      expect(saved.status).toBe(200);
      expect(saved.body.data.items[0]).toMatchObject({ sheetMusic: { id: mainSheet.id }, piece: { id: piece.id } });
    });

    it('ITC-SH-013 replacing the recording updates the duration, keeps the old file, sends the job again', async () => {
      const { mainSheet } = await TestContext.createPublishedPiece(gvA);
      const before = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheet.id } });
      const newAudioId = await F.wav(gvA, 9);

      const replaced = await F.put(`/lecturer/sheet-music/${mainSheet.id}/files/audio`, { fileId: newAudioId }, gvA);
      expect(replaced.status).toBe(200);
      expect(replaced.body.data).toMatchObject({ durationSec: 9, files: { audio: { id: newAudioId, durationSec: 9 } } });

      const after = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheet.id } });
      expect(after.analysisJobId).not.toBeNull();
      expect(after.analysisJobId).not.toBe(before.analysisJobId);
      expect(await prisma.mediaFile.findUnique({ where: { id: before.referenceAudioId! } })).not.toBeNull();
    });

    it('ITC-SH-014 a WAV in the sheet slot is rejected', async () => {
      const { mainSheetId } = await withMainSheet();
      const audioId = await F.wav(gvA, 6);
      F.expectError(await F.put(`/lecturer/sheet-music/${mainSheetId}/files/sheet`, { fileId: audioId }, gvA), 400,
        { code: 'MSG-08', field: 'fileId', message: M.wrongSlot });
    });

    it('ITC-SH-015 a file already in use (the current sheet file) is rejected', async () => {
      const { mainSheetId, sheetFileId } = await withMainSheet();
      F.expectError(await F.put(`/lecturer/sheet-music/${mainSheetId}/files/sheet`, { fileId: sheetFileId }, gvA), 409,
        { code: 'MSG-08', field: 'fileId', message: M.fileInUse });
    });

    it('ITC-SH-037 a tutorial video through the video slot; the viewer opens the video tab', async () => {
      const { mainSheet } = await TestContext.createPublishedPiece(gvA);
      const videoId = await F.video(gvA);
      const attached = await F.put(`/lecturer/sheet-music/${mainSheet.id}/files/video`, { fileId: videoId }, gvA);
      expect(attached.status).toBe(200);
      expect(attached.body.data.files.video.id).toBe(videoId);
      const viewer = await F.get(`/library/sheet-music/${mainSheet.id}`);
      expect(viewer.status).toBe(200);
      expect(viewer.body.data).toMatchObject({ defaultMediaTab: 'TUTORIAL_VIDEO', tutorialVideo: { mimeType: 'video/mp4' } });
    });

    it('ITC-SH-038 a slot other than sheet / audio / video is rejected', async () => {
      const { mainSheetId } = await withMainSheet();
      const coverId = await F.png(gvA);
      F.expectValidationError(await F.put(`/lecturer/sheet-music/${mainSheetId}/files/cover`, { fileId: coverId }, gvA), 'slot');
    });

    it('ITC-SH-039 a lecturer without manage rights cannot replace a sheet file', async () => {
      const { mainSheetId, sheetFileId } = await withMainSheet();
      F.expectForbidden(await F.put(`/lecturer/sheet-music/${mainSheetId}/files/sheet`, { fileId: await F.pdf(gvC) }, gvC));
      expect((await prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheetId } })).sheetFileId).toBe(sheetFileId);
    });
  });

  describe('Sheets of a song (GET /api/v1/lecturer/pieces/:id/sheet-music)', () => {
    it('ITC-SH-016 grouped by instrument, main first then by level; LEVEL sheets use the main recording', async () => {
      const piece = await songP1();
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Chính', referenceAudioId: await F.wav(gvA, 6) });
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Nâng cao', kind: 'LEVEL', levelId: nangCao });
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Cơ bản', kind: 'LEVEL', levelId: coBan });

      const response = await F.get(sheetUrl(piece.id), gvA);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ total: 3, groups: [{ instrument: { name: 'Đàn tranh' }, count: 3 }] });
      const items = allItems(response.body.data.groups);
      expect(items.map((item) => item.name)).toEqual(['Chính', 'Cơ bản', 'Nâng cao']);
      expect(items[1]).toMatchObject({ usesMainRecording: true, durationSec: null, analysis: null });
      expect(items[0].analysis).toMatchObject({ status: 'ERROR', error: M.analysisSendFailed });
    });

    it('ITC-SH-040 unknown song → 404; GV-B sees canManage per sheet', async () => {
      const { piece } = await withContributorSheet();
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Bản của A', instrumentId: sao });
      F.expectError(await F.get(sheetUrl(F.zeroId), gvB), 404, { code: 'MSG-08', message: M.pieceNotFound });
      const list = await F.get(sheetUrl(piece.id), gvB);
      expect(list.status).toBe(200);
      const items = allItems(list.body.data.groups);
      expect(items.find((item) => item.name === 'Bản của B')?.canManage).toBe(true);
      expect(items.find((item) => item.name === 'Bản của A')?.canManage).toBe(false);
    });
  });
});
