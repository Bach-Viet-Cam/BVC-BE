import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from '../../support/TestContext.ts';
import F from './MusicLibraryFixture.ts';

type TestUser = Awaited<ReturnType<typeof TestContext.createUser>>;
const { prisma } = TestContext;
const M = F.messages;

describe('Report 5.2 – Saved Items (UC-08)', () => {
  let gvA: TestUser;
  let sv1: TestUser;
  let sv2: TestUser;

  beforeEach(async () => {
    await TestContext.reset();
    gvA = await TestContext.createUser('LECTURER', 'gv.a@test.local');
    sv1 = await TestContext.createUser('STUDENT', 'sv.1@test.local');
    sv2 = await TestContext.createUser('STUDENT', 'sv.2@test.local');
  });

  const savePiece = (user: TestUser, pieceId: string) => F.put(`/me/saved/pieces/${pieceId}`, {}, user);
  const unsavePiece = (user: TestUser, pieceId: string) => F.delete(`/me/saved/pieces/${pieceId}`, user);
  const saveSheet = (user: TestUser, sheetId: string) => F.put(`/me/saved/sheet-music/${sheetId}`, {}, user);
  const savedCount = (studentId: string) => prisma.savedItem.count({ where: { studentId } });

  // "Bài 1" ($P1) public with the Đàn tranh main sheet "Bản chính" ($S1, with recording)
  const song1 = () => TestContext.createPublishedPiece(gvA, { title: 'Bài 1' });

  describe('Save / unsave a song (PUT, DELETE /api/v1/me/saved/pieces/:id)', () => {
    it('ITC-SV-001 Guest (401) and lecturer (403) cannot use the save API', async () => {
      const { piece } = await song1();
      F.expectUnauthorized(await F.put(`/me/saved/pieces/${piece.id}`, {}));
      F.expectForbidden(await savePiece(gvA, piece.id));
    });

    it('ITC-SV-002 saving twice does not create a duplicate row', async () => {
      const { piece } = await song1();
      const first = await savePiece(sv1, piece.id);
      expect(first.status).toBe(200);
      expect(first.body.message).toBe('Lưu bài hát thành công.');
      expect(first.body.data).toEqual({ isSaved: true });
      const second = await savePiece(sv1, piece.id);
      expect(second.status).toBe(200);
      expect(second.body.data).toEqual({ isSaved: true });
      expect(await prisma.savedItem.count({ where: { studentId: sv1.id, targetType: 'PIECE' } })).toBe(1);
    });

    it('ITC-SV-003 isSaved in the library depends on the viewer', async () => {
      const { piece } = await song1();
      await savePiece(sv1, piece.id);
      expect((await F.get('/library/pieces', sv1)).body.data.items[0].isSaved).toBe(true);
      expect((await F.get('/library/pieces', sv2)).body.data.items[0].isSaved).toBe(false);
      expect((await F.get('/library/pieces')).body.data.items[0].isSaved).toBe(false);
      const detail = await F.get(`/library/pieces/${piece.id}`, sv1);
      expect(detail.status).toBe(200);
      expect(detail.body.data.isSaved).toBe(true);
    });

    it('ITC-SV-004 unsaving deletes the row and isSaved goes back to false', async () => {
      const { piece } = await song1();
      await savePiece(sv1, piece.id);
      const response = await unsavePiece(sv1, piece.id);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Bỏ lưu bài hát thành công.');
      expect(response.body.data).toEqual({ isSaved: false });
      expect(await savedCount(sv1.id)).toBe(0);
      expect((await F.get(`/library/pieces/${piece.id}`, sv1)).body.data.isSaved).toBe(false);
    });

    it('ITC-SV-005 a song that is not public cannot be saved', async () => {
      const hiddenPiece = await TestContext.createPiece(gvA, { title: 'Bài 2' });
      F.expectError(await savePiece(sv1, hiddenPiece.id), 404, { code: 'MSG-08', message: M.pieceNotPublic });
      expect(await savedCount(sv1.id)).toBe(0);
    });

    it('ITC-SV-009 unsaving an item never saved still succeeds (idempotent)', async () => {
      const { piece } = await song1();
      const response = await unsavePiece(sv1, piece.id);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Bỏ lưu bài hát thành công.');
      expect(response.body.data).toEqual({ isSaved: false });
      const unknown = await unsavePiece(sv1, F.zeroId);
      expect(unknown.status).toBe(200);
      expect(unknown.body.data).toEqual({ isSaved: false });
    });

    it('ITC-SV-010 each student only unsaves their own item', async () => {
      const { piece } = await song1();
      await savePiece(sv1, piece.id);
      await savePiece(sv2, piece.id);
      expect((await unsavePiece(sv2, piece.id)).status).toBe(200);
      const saved = await F.get('/me/saved', sv1);
      expect(saved.status).toBe(200);
      expect(saved.body.data.counts.PIECE).toBe(1);
    });
  });

  describe('Save / unsave a sheet (PUT, DELETE /api/v1/me/saved/sheet-music/:id)', () => {
    it('ITC-SV-011 save and unsave a public sheet; isSaved in the viewer and the song detail', async () => {
      const { piece, mainSheet } = await song1();
      const saved = await saveSheet(sv1, mainSheet.id);
      expect(saved.status).toBe(200);
      expect(saved.body.message).toBe('Lưu bản nhạc thành công.');
      expect(saved.body.data).toEqual({ isSaved: true });

      const viewer = await F.get(`/library/sheet-music/${mainSheet.id}`, sv1);
      expect(viewer.status).toBe(200);
      expect(viewer.body.data.sheetMusic.isSaved).toBe(true);

      const detail = await F.get(`/library/pieces/${piece.id}`, sv1);
      expect(detail.status).toBe(200);
      expect(detail.body.data.tabs[0].main.isSaved).toBe(true);
      expect(detail.body.data.isSaved).toBe(false);

      const removed = await F.delete(`/me/saved/sheet-music/${mainSheet.id}`, sv1);
      expect(removed.status).toBe(200);
      expect(removed.body.message).toBe('Bỏ lưu bản nhạc thành công.');
      expect(removed.body.data).toEqual({ isSaved: false });
    });

    it('ITC-SV-012 a HIDDEN sheet, a sheet of a hidden song or an unknown id cannot be saved', async () => {
      const { piece, mainSheet } = await song1();
      const hiddenSheet = await F.createSheetOrThrow(gvA, piece.id, { name: 'Bản ẩn', kind: 'LEVEL', visibility: 'HIDDEN' });
      F.expectError(await saveSheet(sv1, hiddenSheet.id), 404, { code: 'MSG-08', message: M.sheetNotPublic });
      expect((await F.setPieceVisibility(gvA, piece.id, 'HIDDEN')).status).toBe(200);
      F.expectError(await saveSheet(sv1, mainSheet.id), 404, { code: 'MSG-08', message: M.sheetNotPublic });
      F.expectError(await saveSheet(sv1, F.zeroId), 404, { code: 'MSG-08', message: M.sheetNotPublic });
    });
  });

  describe('"Saved" screen (GET /api/v1/me/saved)', () => {
    it('ITC-SV-006 both tabs with counts, newest saved first, enough data to display', async () => {
      const { piece: piece1, mainSheet } = await song1();
      const piece2 = await TestContext.createPiece(gvA, { title: 'Bài 2' });
      await F.setPieceVisibility(gvA, piece2.id, 'PUBLIC');

      await savePiece(sv1, piece1.id);
      await F.pause();
      await savePiece(sv1, piece2.id);
      await F.pause();
      await saveSheet(sv1, mainSheet.id);

      const pieces = await F.get('/me/saved', sv1);
      expect(pieces.status).toBe(200);
      expect(pieces.body.data).toMatchObject({ counts: { PIECE: 2, SHEET_MUSIC: 1 }, total: 2, page: 1, pageSize: 20, emptyState: null });
      expect(pieces.body.data.items.map((item: { piece: { title: string } }) => item.piece.title)).toEqual(['Bài 2', 'Bài 1']);
      expect(pieces.body.data.items[0].piece.genre.name).toBe('Dân ca Nam Bộ');

      const sheets = await F.get('/me/saved?type=SHEET_MUSIC', sv1);
      expect(sheets.status).toBe(200);
      expect(sheets.body.data.items[0]).toMatchObject({
        sheetMusic: { name: 'Bản chính', isMain: true, instrument: { name: 'Đàn tranh' } },
        piece: { title: 'Bài 1' }
      });
    });

    it('ITC-SV-007 hiding the song hides the saved items (rows kept); they come back when public again', async () => {
      const { piece, mainSheet } = await song1();
      await savePiece(sv1, piece.id);
      await saveSheet(sv1, mainSheet.id);

      expect((await F.setPieceVisibility(gvA, piece.id, 'HIDDEN')).status).toBe(200);
      const hidden = await F.get('/me/saved', sv1);
      expect(hidden.status).toBe(200);
      expect(hidden.body.data).toMatchObject({ counts: { PIECE: 0, SHEET_MUSIC: 0 }, emptyState: { code: 'MSG-06', message: 'Danh sách đã lưu chưa có bài hát.' } });
      expect(await savedCount(sv1.id)).toBe(2);

      expect((await F.setPieceVisibility(gvA, piece.id, 'PUBLIC')).status).toBe(200);
      const shown = await F.get('/me/saved', sv1);
      expect(shown.status).toBe(200);
      expect(shown.body.data.counts).toEqual({ PIECE: 1, SHEET_MUSIC: 1 });
    });

    it('ITC-SV-008 an admin-hidden song is not in the saved list', async () => {
      const { piece } = await song1();
      await savePiece(sv1, piece.id);
      await prisma.piece.update({ where: { id: piece.id }, data: { moderation: 'ADMIN_HIDDEN' } });
      const saved = await F.get('/me/saved', sv1);
      expect(saved.status).toBe(200);
      expect(saved.body.data.total).toBe(0);
      expect(saved.body.data.counts.PIECE).toBe(0);
    });

    it('ITC-SV-013 hiding only the saved sheet removes it from SHEET_MUSIC, the song stays in PIECE', async () => {
      const { piece, mainSheet } = await song1();
      await savePiece(sv1, piece.id);
      await saveSheet(sv1, mainSheet.id);
      expect((await F.patch(`/lecturer/sheet-music/${mainSheet.id}/visibility`, { visibility: 'HIDDEN' }, gvA)).status).toBe(200);
      const sheets = await F.get('/me/saved?type=SHEET_MUSIC', sv1);
      expect(sheets.status).toBe(200);
      expect(sheets.body.data).toMatchObject({
        total: 0, counts: { PIECE: 1, SHEET_MUSIC: 0 }, emptyState: { code: 'MSG-06', message: 'Danh sách đã lưu chưa có bản nhạc.' }
      });
    });

    it('ITC-SV-014 paging and validation of the saved list', async () => {
      const titles = ['Bài 1', 'Bài 2', 'Bài 3'];
      for (const title of titles) {
        const piece = await TestContext.createPiece(gvA, { title });
        await F.setPieceVisibility(gvA, piece.id, 'PUBLIC');
        await savePiece(sv1, piece.id);
        await F.pause();
      }
      const secondPage = await F.get('/me/saved?pageSize=2&page=2', sv1);
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data).toMatchObject({ total: 3, page: 2, pageSize: 2, totalPages: 2 });
      expect(secondPage.body.data.items.map((item: { piece: { title: string } }) => item.piece.title)).toEqual(['Bài 1']);
      F.expectValidationError(await F.get('/me/saved?type=ALBUM', sv1), 'type');
      F.expectValidationError(await F.get('/me/saved?pageSize=101', sv1), 'pageSize');
    });

    it('ITC-SV-015 a saved sheet is not affected when the lecturer replaces the sheet file', async () => {
      const { mainSheet } = await song1();
      await saveSheet(sv1, mainSheet.id);
      const newFileId = await F.pdf(gvA);
      expect((await F.put(`/lecturer/sheet-music/${mainSheet.id}/files/sheet`, { fileId: newFileId }, gvA)).status).toBe(200);

      const saved = await F.get('/me/saved?type=SHEET_MUSIC', sv1);
      expect(saved.status).toBe(200);
      expect(saved.body.data.items[0].sheetMusic.id).toBe(mainSheet.id);
      expect(saved.body.data.counts.SHEET_MUSIC).toBe(1);

      const viewer = await F.get(`/library/sheet-music/${mainSheet.id}`, sv1);
      expect(viewer.status).toBe(200);
      expect(viewer.body.data.sheetFile.id).toBe(newFileId);
      expect(viewer.body.data.sheetMusic.isSaved).toBe(true);
    });
  });
});
