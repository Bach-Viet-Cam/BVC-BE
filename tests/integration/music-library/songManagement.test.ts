import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from '../../support/TestContext.ts';
import F from './MusicLibraryFixture.ts';

type TestUser = Awaited<ReturnType<typeof TestContext.createUser>>;
const { prisma } = TestContext;
const M = F.messages;

describe('Report 5.2 – Song Management (UC-05)', () => {
  let gvA: TestUser;
  let gvB: TestUser;
  let sv1: TestUser;
  let nambo: string;

  beforeEach(async () => {
    await TestContext.reset();
    gvA = await TestContext.createUser('LECTURER', 'gv.a@test.local');
    gvB = await TestContext.createUser('LECTURER', 'gv.b@test.local');
    sv1 = await TestContext.createUser('STUDENT', 'sv.1@test.local');
    nambo = F.genre('Dân ca Nam Bộ');
  });

  const createPiece = (body: Record<string, unknown>, user: TestUser = gvA) => F.post('/lecturer/pieces', body, user);
  const songP1 = () => TestContext.createPiece(gvA);

  async function songWithCover() {
    const piece = await songP1();
    const coverId = await F.png(gvA, false);
    const response = await F.put(`/lecturer/pieces/${piece.id}/cover`, { fileId: coverId }, gvA);
    return { piece, coverId, response };
  }

  async function threeSongs() {
    await TestContext.createPiece(gvA, { title: 'Lý ngựa ô' });
    await TestContext.createPiece(gvA, { title: 'Trống cơm', composer: 'Dân gian Bắc Bộ' });
    await TestContext.createPublishedPiece(gvA, { title: 'Bèo dạt mây trôi' });
  }

  describe('Create a song (POST /api/v1/lecturer/pieces)', () => {
    it('ITC-SM-001 missing "Tiêu đề" → MSG-35, nothing stored', async () => {
      const response = await createPiece({ genreId: nambo });
      F.expectError(response, 400, { code: 'MSG-35', field: 'title', message: 'Tiêu đề không được để trống.' });
      expect(await prisma.piece.count()).toBe(0);
    });

    it('ITC-SM-002 "Tiêu đề" 201 characters → MSG-37', async () => {
      const response = await createPiece({ title: 'a'.repeat(201), genreId: nambo });
      F.expectError(response, 400, { code: 'MSG-37', field: 'title', message: 'Tiêu đề không được vượt quá 200 ký tự.' });
    });

    it('ITC-SM-003 a new song is HIDDEN and not in the public library', async () => {
      const created = await createPiece({ title: 'Lý ngựa ô', composer: 'Dân gian', description: 'Dân ca Nam Bộ', genreId: nambo });
      expect(created.status).toBe(201);
      expect(created.body.message).toBe('Tạo bài hát thành công.');
      expect(created.body.data.piece).toMatchObject({
        visibility: 'HIDDEN', effectiveVisibility: 'HIDDEN', canEdit: true, canChangeVisibility: true, sheetMusicCount: 0, instruments: []
      });
      expect(created.body.data.warning).toBeNull();

      const detail = await F.get(`/lecturer/pieces/${created.body.data.piece.id}`, gvA);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ visibility: 'HIDDEN', title: 'Lý ngựa ô' });

      const library = await F.get('/library/pieces');
      expect(library.status).toBe(200);
      expect(library.body.data).toMatchObject({ items: [], total: 0, emptyState: { code: 'MSG-06', message: 'Thư viện chưa có bài hát.' } });
    });

    it('ITC-SM-015 "Tiêu đề" bounds 1 / 200 characters and trimming', async () => {
      const longest = await createPiece({ title: 'a'.repeat(200), genreId: nambo });
      expect(longest.status).toBe(201);
      expect(longest.body.data.piece.title).toHaveLength(200);

      const shortest = await createPiece({ title: 'Ă', genreId: nambo });
      expect(shortest.status).toBe(201);
      expect(shortest.body.data.piece.title).toBe('Ă');

      const padded = await createPiece({ title: '  Trống cơm  ', genreId: nambo });
      expect(padded.status).toBe(201);
      expect(padded.body.data.piece.title).toBe('Trống cơm');
      const stored = await prisma.piece.findUniqueOrThrow({ where: { id: padded.body.data.piece.id } });
      expect(stored.titleNormalized).toBe('trong com');
    });

    it('ITC-SM-016 missing "Thể loại" → MSG-35', async () => {
      const response = await createPiece({ title: 'Lý ngựa ô' });
      F.expectError(response, 400, { code: 'MSG-35', field: 'genreId', message: 'Thể loại không được để trống.' });
    });

    it('ITC-SM-017 unknown genre id → MSG-35, no song created', async () => {
      const response = await createPiece({ title: 'Lý ngựa ô', genreId: F.zeroId });
      F.expectError(response, 400, { code: 'MSG-35', field: 'genreId', message: 'Thể loại không được để trống.' });
      expect(await prisma.piece.count()).toBe(0);
    });

    it('ITC-SM-018 create PUBLIC with no sheet → MSG-46 warning, listed with 0 instruments', async () => {
      const created = await createPiece({ title: 'Bèo dạt mây trôi', composer: 'Dân gian', description: 'Dân ca Nam Bộ', genreId: nambo, visibility: 'PUBLIC' });
      expect(created.status).toBe(201);
      expect(created.body.data.piece.visibility).toBe('PUBLIC');
      expect(created.body.data.warning).toEqual({ code: 'MSG-46', message: M.noPublicSheet });

      const library = await F.get('/library/pieces');
      expect(library.status).toBe(200);
      expect(library.body.data.total).toBe(1);
      expect(library.body.data.items[0]).toMatchObject({ title: 'Bèo dạt mây trôi', instrumentCount: 0, isSaved: false });
    });

    it('ITC-SM-019 cover on create; the same image cannot be reused', async () => {
      const coverId = await F.png(gvA);
      const first = await createPiece({ title: 'Lý ngựa ô', composer: 'Dân gian', description: 'Dân ca Nam Bộ', genreId: nambo, coverFileId: coverId });
      expect(first.status).toBe(201);
      expect(first.body.data.piece.cover.id).toBe(coverId);
      expect(first.body.data.piece.coverUrl.startsWith('http://localhost:3000/uploads/cover/')).toBe(true);

      const second = await createPiece({ title: 'Trống cơm', composer: 'Dân gian', description: 'Dân ca Nam Bộ', genreId: nambo, coverFileId: coverId });
      F.expectError(second, 409, { code: 'MSG-08', field: 'coverFileId', message: M.fileInUse });
      expect(await prisma.piece.count()).toBe(1);
    });

    it('ITC-SM-020 length limits of "Tên tác giả" (200) and "Mô tả" (1000)', async () => {
      const longComposer = await createPiece({ title: 'Lý ngựa ô', genreId: nambo, composer: 'a'.repeat(201) });
      F.expectError(longComposer, 400, { code: 'MSG-37', field: 'composer', message: 'Tên tác giả không được vượt quá 200 ký tự.' });

      const longDescription = await createPiece({ title: 'Lý ngựa ô', genreId: nambo, description: 'a'.repeat(1001) });
      F.expectError(longDescription, 400, { code: 'MSG-37', field: 'description', message: 'Mô tả không được vượt quá 1000 ký tự.' });

      const atLimit = await createPiece({ title: 'Lý ngựa ô', genreId: nambo, composer: 'a'.repeat(200), description: 'a'.repeat(1000) });
      expect(atLimit.status).toBe(201);
    });

    it('ITC-SM-021 visibility outside PUBLIC / HIDDEN is rejected', async () => {
      F.expectValidationError(await createPiece({ title: 'Lý ngựa ô', genreId: nambo, visibility: 'PRIVATE' }), 'visibility');
    });

    it('ITC-SM-022 coverFileId pointing to a non-cover file is rejected', async () => {
      const audioId = await F.wav(gvA, 6);
      const response = await createPiece({ title: 'Lý ngựa ô', composer: 'Dân gian', description: 'Dân ca Nam Bộ', genreId: nambo, coverFileId: audioId });
      F.expectError(response, 400, { code: 'MSG-08', field: 'coverFileId', message: M.wrongSlot });
    });
  });

  describe('Song detail (GET /api/v1/lecturer/pieces/:id)', () => {
    it('ITC-SM-023 owner reads the detail with edit rights and sheet counts', async () => {
      const piece = await songP1();
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Bản 1', referenceAudioId: await F.wav(gvA, 6, false) });

      const response = await F.get(`/lecturer/pieces/${piece.id}`, gvA);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        canEdit: true,
        canChangeVisibility: true,
        sheetMusicCount: 1,
        publicSheetMusicCount: 1,
        instruments: [{ id: F.instrument('DAN_TRANH'), name: 'Đàn tranh' }],
        genre: { id: nambo, name: 'Dân ca Nam Bộ' }
      });
    });

    it('ITC-SM-024 unknown song id → 404 MSG-08', async () => {
      F.expectError(await F.get(`/lecturer/pieces/${F.zeroId}`, gvA), 404, { code: 'MSG-08', message: M.pieceNotFound });
    });
  });

  describe('Edit a song (PUT /api/v1/lecturer/pieces/:id)', () => {
    it('ITC-SM-025 owner edits title / composer; search columns are refreshed', async () => {
      const piece = await songP1();
      const updated = await F.put(`/lecturer/pieces/${piece.id}`, { title: 'Lý ngựa ô (bản Nam Bộ)', composer: 'Đặng Văn Hòa', genreId: nambo }, gvA);
      expect(updated.status).toBe(200);
      expect(updated.body.message).toBe('Cập nhật bài hát thành công.');
      expect(updated.body.data.piece).toMatchObject({ title: 'Lý ngựa ô (bản Nam Bộ)', composer: 'Đặng Văn Hòa', description: null });
      expect(updated.body.data.warning).toBeNull();

      const search = await F.get('/lecturer/pieces?q=dang van hoa', gvA);
      expect(search.status).toBe(200);
      expect(search.body.data.total).toBe(1);
      expect(search.body.data.items[0].id).toBe(piece.id);

      const stored = await prisma.piece.findUniqueOrThrow({ where: { id: piece.id } });
      expect([stored.titleNormalized, stored.composerNormalized]).toEqual(['ly ngua o (ban nam bo)', 'dang van hoa']);
    });

    it('ITC-SM-026 a lecturer who is not the owner cannot edit (R-01)', async () => {
      const piece = await songP1();
      F.expectError(await F.put(`/lecturer/pieces/${piece.id}`, { title: 'Bài của B', genreId: nambo }, gvB), 403, { code: 'MSG-08', message: M.pieceNotOwner });
      const detail = await F.get(`/lecturer/pieces/${piece.id}`, gvA);
      expect(detail.status).toBe(200);
      expect(detail.body.data.title).toBe('Lý ngựa ô');
    });

    it('ITC-SM-027 PUT with visibility on an admin-hidden song is blocked, content edit still works', async () => {
      const { piece } = await TestContext.createPublishedPiece(gvA);
      await prisma.piece.update({ where: { id: piece.id }, data: { moderation: 'ADMIN_HIDDEN', moderationReason: 'Vi phạm bản quyền' } });

      const withVisibility = await F.put(`/lecturer/pieces/${piece.id}`, { title: 'Lý ngựa ô', genreId: nambo, visibility: 'HIDDEN' }, gvA);
      F.expectError(withVisibility, 409, { code: 'MSG-08', field: 'visibility', message: M.adminHiddenPiece });

      const contentOnly = await F.put(`/lecturer/pieces/${piece.id}`, { title: 'Lý ngựa ô (sửa lỗi chính tả)', genreId: nambo }, gvA);
      expect(contentOnly.status).toBe(200);
      expect(contentOnly.body.data.piece).toMatchObject({ title: 'Lý ngựa ô (sửa lỗi chính tả)', effectiveVisibility: 'ADMIN_HIDDEN' });
    });

    it('ITC-SM-028 PUT changing coverFileId replaces the cover and deletes the old image', async () => {
      const { piece, coverId } = await songWithCover();
      const oldCover = await prisma.mediaFile.findUniqueOrThrow({ where: { id: coverId } });
      const newCoverId = await F.png(gvA);

      const response = await F.put(`/lecturer/pieces/${piece.id}`, { title: 'Lý ngựa ô', genreId: nambo, coverFileId: newCoverId }, gvA);
      expect(response.status).toBe(200);
      expect(response.body.data.piece.cover.id).toBe(newCoverId);

      expect(await prisma.mediaFile.findUnique({ where: { id: coverId } })).toBeNull();
      expect(F.storedFileExists(oldCover.storageKey)).toBe(false);
      const newCover = await prisma.mediaFile.findUniqueOrThrow({ where: { id: newCoverId } });
      expect(F.storedFileExists(newCover.storageKey)).toBe(true);
    });

    it('ITC-SM-029 "Tiêu đề" with only spaces → MSG-35', async () => {
      const piece = await songP1();
      const response = await F.put(`/lecturer/pieces/${piece.id}`, { title: '   ', genreId: nambo }, gvA);
      F.expectError(response, 400, { code: 'MSG-35', field: 'title', message: 'Tiêu đề không được để trống.' });
    });
  });

  describe('Show / hide a song (PATCH /api/v1/lecturer/pieces/:id/visibility)', () => {
    it('ITC-SM-004 publishing a song with no public sheet → MSG-46 warning (R-03)', async () => {
      const piece = await songP1();
      const response = await F.setPieceVisibility(gvA, piece.id, 'PUBLIC');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Hiện bài hát thành công.');
      expect(response.body.data.piece).toMatchObject({ visibility: 'PUBLIC', publicSheetMusicCount: 0 });
      expect(response.body.data.warning).toEqual({ code: 'MSG-46', message: M.noPublicSheet });
    });

    it('ITC-SM-005 publishing a song with a public main sheet gives no warning', async () => {
      const created = await createPiece({ title: 'Lý ngựa ô', composer: 'Dân gian', description: 'Dân ca Nam Bộ', genreId: nambo });
      const pieceId = created.body.data.piece.id;
      const sheetFileId = await F.pdf(gvA);
      const audioId = await F.wav(gvA, 6);
      const sheet = await F.createSheet(gvA, pieceId, { name: 'Bản chính', sheetFileId, referenceAudioId: audioId, visibility: 'PUBLIC' });
      expect(sheet.status).toBe(201);

      const response = await F.setPieceVisibility(gvA, pieceId, 'PUBLIC');
      expect(response.status).toBe(200);
      expect(response.body.data.piece).toMatchObject({ visibility: 'PUBLIC', publicSheetMusicCount: 1 });
      expect(response.body.data.warning).toBeNull();
    });

    it('ITC-SM-006 admin-hidden song: no visibility change, reason shown, gone from the library', async () => {
      const { piece } = await TestContext.createPublishedPiece(gvA);
      await prisma.piece.update({ where: { id: piece.id }, data: { moderation: 'ADMIN_HIDDEN', moderationReason: 'Vi phạm bản quyền' } });

      F.expectError(await F.setPieceVisibility(gvA, piece.id, 'HIDDEN'), 409, { code: 'MSG-08', field: 'visibility', message: M.adminHiddenPiece });

      const detail = await F.get(`/lecturer/pieces/${piece.id}`, gvA);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({
        visibility: 'PUBLIC', moderation: 'ADMIN_HIDDEN', effectiveVisibility: 'ADMIN_HIDDEN', canChangeVisibility: false, moderationReason: 'Vi phạm bản quyền'
      });

      const library = await F.get('/library/pieces');
      expect(library.status).toBe(200);
      expect(library.body.data.total).toBe(0);
      F.expectError(await F.get(`/library/pieces/${piece.id}`), 404, { code: 'MSG-08', message: M.pieceNotPublic });
    });

    it('ITC-SM-030 hiding a public song removes it from library, viewer and "Saved"', async () => {
      const { piece, mainSheet } = await TestContext.createPublishedPiece(gvA);
      expect((await F.put(`/me/saved/pieces/${piece.id}`, {}, sv1)).status).toBe(200);

      const hidden = await F.setPieceVisibility(gvA, piece.id, 'HIDDEN');
      expect(hidden.status).toBe(200);
      expect(hidden.body.message).toBe('Ẩn bài hát thành công.');
      expect(hidden.body.data.piece.visibility).toBe('HIDDEN');
      expect(hidden.body.data.warning).toBeNull();

      expect((await F.get('/library/pieces')).body.data.total).toBe(0);
      F.expectError(await F.get(`/library/sheet-music/${mainSheet.id}`), 404, { code: 'MSG-08', message: M.sheetNotPublic });

      const saved = await F.get('/me/saved', sv1);
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject({ total: 0, counts: { PIECE: 0, SHEET_MUSIC: 0 } });
      expect(await prisma.savedItem.count({ where: { studentId: sv1.id } })).toBe(1);
    });

    it('ITC-SM-031 missing or wrong visibility in the body is rejected', async () => {
      const piece = await songP1();
      F.expectValidationError(await F.patch(`/lecturer/pieces/${piece.id}/visibility`, {}, gvA), 'visibility');
      F.expectValidationError(await F.patch(`/lecturer/pieces/${piece.id}/visibility`, { visibility: 'ARCHIVED' }, gvA), 'visibility');
    });
  });

  describe('Song access rights (R-01)', () => {
    it('ITC-SM-007 another lecturer reads the song but cannot change visibility, not in own list', async () => {
      const piece = await songP1();
      const detail = await F.get(`/lecturer/pieces/${piece.id}`, gvB);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ canEdit: false, canChangeVisibility: false });

      F.expectError(await F.setPieceVisibility(gvB, piece.id, 'PUBLIC'), 403, { code: 'MSG-08', message: M.pieceNotOwner });

      const ownList = await F.get('/lecturer/pieces', gvB);
      expect(ownList.status).toBe(200);
      expect(ownList.body.data.total).toBe(0);
    });

    it('ITC-SM-008 Student → 403, Guest → 401 on the lecturer API', async () => {
      F.expectForbidden(await F.get('/lecturer/pieces', sv1));
      F.expectUnauthorized(await F.get('/lecturer/pieces'));
    });
  });

  describe('Lecturer list and search (GET /api/v1/lecturer/pieces)', () => {
    it('ITC-SM-009 accent-free, case-insensitive search by title and composer', async () => {
      await threeSongs();
      const byTitle = await F.get('/lecturer/pieces?q=NGUA O', gvA);
      expect(byTitle.status).toBe(200);
      expect(F.titles(byTitle)).toEqual(['Lý ngựa ô']);
      const byComposer = await F.get('/lecturer/pieces?q=bac bo', gvA);
      expect(byComposer.status).toBe(200);
      expect(F.titles(byComposer)).toEqual(['Trống cơm']);
    });

    it('ITC-SM-010 filter by visibility and by sheet instrument', async () => {
      await threeSongs();
      expect(F.titles(await F.get('/lecturer/pieces?visibility=PUBLIC', gvA))).toEqual(['Bèo dạt mây trôi']);
      expect((await F.get('/lecturer/pieces?visibility=HIDDEN', gvA)).body.data.total).toBe(2);
      expect((await F.get(`/lecturer/pieces?instrumentId=${F.instrument('DAN_TRANH')}`, gvA)).body.data.total).toBe(1);
    });

    it('ITC-SM-011 default list: 20 per page, latest updated first, sheet counts', async () => {
      await threeSongs();
      const response = await F.get('/lecturer/pieces', gvA);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ total: 3, page: 1, pageSize: 20, totalPages: 1 });
      expect(response.body.data.items[0]).toMatchObject({ title: 'Bèo dạt mây trôi', sheetMusicCount: 1, publicSheetMusicCount: 1 });
    });

    it('ITC-SM-032 visibility=ADMIN_HIDDEN only returns admin-hidden songs', async () => {
      await threeSongs();
      await prisma.piece.updateMany({ where: { title: 'Trống cơm' }, data: { moderation: 'ADMIN_HIDDEN' } });
      const adminHidden = await F.get('/lecturer/pieces?visibility=ADMIN_HIDDEN', gvA);
      expect(F.titles(adminHidden)).toEqual(['Trống cơm']);
      expect(adminHidden.body.data.items[0].effectiveVisibility).toBe('ADMIN_HIDDEN');
      expect(F.titles(await F.get('/lecturer/pieces?visibility=HIDDEN', gvA))).toEqual(['Lý ngựa ô']);
    });

    it('ITC-SM-033 pageSize bounds (1..100) and wrong parameters', async () => {
      await threeSongs();
      const secondPage = await F.get('/lecturer/pieces?pageSize=1&page=2', gvA);
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data).toMatchObject({ total: 3, page: 2, pageSize: 1, totalPages: 3 });
      expect(secondPage.body.data.items).toHaveLength(1);
      expect((await F.get('/lecturer/pieces?pageSize=100', gvA)).body.data.pageSize).toBe(100);
      F.expectValidationError(await F.get('/lecturer/pieces?pageSize=101', gvA), 'pageSize');
      F.expectValidationError(await F.get('/lecturer/pieces?page=0', gvA), 'page');
      F.expectValidationError(await F.get('/lecturer/pieces?visibility=DELETED', gvA), 'visibility');
    });

    it('ITC-SM-034 instrument + level filters must match on the same sheet', async () => {
      const piece = await songP1();
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Tranh cơ bản', instrumentId: F.instrument('DAN_TRANH'), levelId: F.level('Cơ bản') });
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Sáo nâng cao', instrumentId: F.instrument('SAO_TRUC'), levelId: F.level('Nâng cao') });

      const matching = await F.get(`/lecturer/pieces?instrumentId=${F.instrument('DAN_TRANH')}&levelId=${F.level('Cơ bản')}`, gvA);
      expect(matching.status).toBe(200);
      expect(matching.body.data.total).toBe(1);
      const crossSheet = await F.get(`/lecturer/pieces?instrumentId=${F.instrument('DAN_TRANH')}&levelId=${F.level('Nâng cao')}`, gvA);
      expect(crossSheet.status).toBe(200);
      expect(crossSheet.body.data.total).toBe(0);
    });

    it('ITC-SM-035 search keyword is at most 100 characters', async () => {
      const atLimit = await F.get(`/lecturer/pieces?q=${'a'.repeat(100)}`, gvA);
      expect(atLimit.status).toBe(200);
      expect(atLimit.body.data.total).toBe(0);
      F.expectValidationError(await F.get(`/lecturer/pieces?q=${'a'.repeat(101)}`, gvA), 'q');
    });
  });

  describe('Inactive categories (GBR-44)', () => {
    it('ITC-SM-012 inactive genre: kept on edit, not selectable for a new song, gone from filters', async () => {
      const created = await createPiece({ title: 'Lý ngựa ô', composer: 'Dân gian', description: 'Dân ca Nam Bộ', genreId: nambo });
      const pieceId = created.body.data.piece.id;
      await prisma.category.update({ where: { id: nambo }, data: { status: 'INACTIVE' } });

      const edited = await F.put(`/lecturer/pieces/${pieceId}`, { title: 'Lý ngựa ô', genreId: nambo }, gvA);
      expect(edited.status).toBe(200);
      expect(edited.body.data.piece.genre.id).toBe(nambo);

      F.expectError(await createPiece({ title: 'Bài mới', genreId: nambo }), 400, { code: 'MSG-08', field: 'genreId', message: M.inactiveCategory });

      const filters = await F.get('/library/filters');
      expect(filters.status).toBe(200);
      expect(filters.body.data.genres.map((genre: { name: string }) => genre.name)).toEqual(['Dân ca Bắc Bộ', 'Nhạc tài tử']);
    });
  });

  describe('Cover image (PUT / DELETE /api/v1/lecturer/pieces/:id/cover)', () => {
    it('ITC-SM-013 upload a PNG and attach it as the cover; the image URL is readable', async () => {
      const { coverId, response } = await songWithCover();
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Cập nhật ảnh bìa thành công.');
      expect(response.body.data.coverUrl.startsWith('http://localhost:3000/uploads/cover/')).toBe(true);
      expect(response.body.data.cover).toMatchObject({ id: coverId, mimeType: 'image/png' });
      expect((await prisma.mediaFile.findUniqueOrThrow({ where: { id: coverId } })).status).toBe('READY');

      const image = await F.fetchPublicUrl(response.body.data.coverUrl);
      expect(image.status).toBe(200);
      expect(image.headers['content-type']).toContain('image/png');
    });

    it('ITC-SM-014 removing the cover deletes the media_file row and the stored file', async () => {
      const { piece, coverId, response: attached } = await songWithCover();
      const oldUrl = attached.body.data.coverUrl;

      const removed = await F.delete(`/lecturer/pieces/${piece.id}/cover`, gvA);
      expect(removed.status).toBe(200);
      expect(removed.body.message).toBe('Gỡ ảnh bìa thành công.');
      expect(removed.body.data).toMatchObject({ coverUrl: null, cover: null });
      expect(await prisma.mediaFile.findUnique({ where: { id: coverId } })).toBeNull();
      expect((await F.fetchPublicUrl(oldUrl)).status).toBe(404);
    });

    it('ITC-SM-036 replacing the cover again deletes the previous image (no orphan)', async () => {
      const { piece } = await songWithCover();
      const secondCoverId = await F.png(gvA);
      const replaced = await F.put(`/lecturer/pieces/${piece.id}/cover`, { fileId: secondCoverId }, gvA);
      expect(replaced.status).toBe(200);
      expect(replaced.body.data.cover.id).toBe(secondCoverId);
      const covers = await prisma.mediaFile.findMany({ where: { kind: 'COVER' }, select: { id: true } });
      expect(covers.map((cover) => cover.id)).toEqual([secondCoverId]);
    });

    it('ITC-SM-037 an image uploaded by another lecturer cannot be attached', async () => {
      const piece = await songP1();
      const foreignCoverId = await F.png(gvB);
      const response = await F.put(`/lecturer/pieces/${piece.id}/cover`, { fileId: foreignCoverId }, gvA);
      F.expectError(response, 400, { code: 'MSG-08', field: 'fileId', message: M.fileNotOwned });
    });

    it('ITC-SM-038 a lecturer who is not the owner cannot replace / remove the cover', async () => {
      const { piece, coverId } = await songWithCover();
      const foreignCoverId = await F.png(gvB);
      F.expectError(await F.put(`/lecturer/pieces/${piece.id}/cover`, { fileId: foreignCoverId }, gvB), 403, { code: 'MSG-08', message: M.pieceNotOwner });
      F.expectError(await F.delete(`/lecturer/pieces/${piece.id}/cover`, gvB), 403, { code: 'MSG-08', message: M.pieceNotOwner });
      expect(await prisma.mediaFile.findUnique({ where: { id: coverId } })).not.toBeNull();
      expect((await prisma.piece.findUniqueOrThrow({ where: { id: piece.id } })).coverFileId).toBe(coverId);
    });

    it('ITC-SM-039 removing the cover when there is none succeeds', async () => {
      const piece = await songP1();
      const response = await F.delete(`/lecturer/pieces/${piece.id}/cover`, gvA);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Gỡ ảnh bìa thành công.');
      expect(response.body.data.coverUrl).toBeNull();
    });

    it('ITC-SM-040 a PDF as cover is rejected; a body without fileId is stopped by validation', async () => {
      const piece = await songP1();
      const pdfId = await F.pdf(gvA);
      F.expectError(await F.put(`/lecturer/pieces/${piece.id}/cover`, { fileId: pdfId }, gvA), 400, { code: 'MSG-08', field: 'fileId', message: M.wrongSlot });
      F.expectError(await F.put(`/lecturer/pieces/${piece.id}/cover`, {}, gvA), 400, { code: 'MSG-35', field: 'fileId', message: 'File không được để trống.' });
    });
  });
});
