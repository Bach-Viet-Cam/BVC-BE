import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from '../../support/TestContext.ts';
import F from './MusicLibraryFixture.ts';

type TestUser = Awaited<ReturnType<typeof TestContext.createUser>>;
type TrendingItem = { title: string; weeklySubmissionCount: number };
const { prisma } = TestContext;
const M = F.messages;

describe('Report 5.2 – Library Browsing (UC-07)', () => {
  let gvA: TestUser;
  let tranh: string;
  let bau: string;
  let sao: string;

  beforeEach(async () => {
    await TestContext.reset();
    gvA = await TestContext.createUser('LECTURER', 'gv.a@test.local');
    tranh = F.instrument('DAN_TRANH');
    bau = F.instrument('DAN_BAU');
    sao = F.instrument('SAO_TRUC');
  });

  const published = (pieceOverrides: Record<string, unknown> = {}, sheetOverrides: Record<string, unknown> = {}) =>
    TestContext.createPublishedPiece(gvA, pieceOverrides, sheetOverrides);
  const trendingRows = (response: { body: { data: { items: TrendingItem[] } } }) =>
    response.body.data.items.map((item) => [item.title, item.weeklySubmissionCount]);

  // ITC-LB-003 data: "A" (Nam Bộ, Cơ bản), "B" (Bắc Bộ, Cơ bản), "C" (Nhạc tài tử, Nâng cao)
  async function threeGenreSongs() {
    const a = await published({ title: 'A', genreId: F.genre('Dân ca Nam Bộ') }, { levelId: F.level('Cơ bản') });
    const b = await published({ title: 'B', genreId: F.genre('Dân ca Bắc Bộ') }, { levelId: F.level('Cơ bản') });
    const c = await published({ title: 'C', genreId: F.genre('Nhạc tài tử') }, { levelId: F.level('Nâng cao') });
    return { a, b, c };
  }

  // ITC-LB-007 data: 13 public songs created in this order
  async function thirteenSongs() {
    for (const title of ['Ă', 'B', 'Đ', 'A', 'C', 'E', 'G', 'H', 'I', 'K', 'L', 'M', 'N']) {
      const piece = await TestContext.createPiece(gvA, { title });
      await F.setPieceVisibility(gvA, piece.id, 'PUBLIC');
      await F.pause(5);
    }
  }

  // ITC-LB-013 data: $P1 public, main $S1 (6 s recording), level sheet "Dễ" $S2 without recording
  async function mainAndLevelSheet() {
    const { piece, mainSheet } = await published();
    const levelSheet = await F.createSheetOrThrow(gvA, piece.id, { name: 'Dễ' });
    return { piece, mainSheetId: mainSheet.id, levelSheetId: levelSheet.id };
  }

  async function addSubmissions(studentId: string, pieceId: string, count: number, createdAt?: Date) {
    await prisma.submission.createMany({ data: Array.from({ length: count }, () => ({ pieceId, studentId, ...(createdAt ? { createdAt } : {}) })) });
  }

  async function studentInClass(email: string, instrumentId: string) {
    const student = await TestContext.createUser('STUDENT', email);
    const classRecord = await prisma.class.create({
      data: {
        name: `Lớp ${email}`, cohort: 'FA26', instrumentId, ownerId: gvA.id,
        startDate: new Date('2026-09-01'), endDate: new Date('2026-12-31'), status: 'ACTIVE'
      }
    });
    await prisma.classMember.create({ data: { classId: classRecord.id, userId: student.id, instrumentId, addedById: gvA.id, source: 'MANUAL' } });
    return student;
  }

  describe('Search and filter (GET /api/v1/library/pieces)', () => {
    it('ITC-LB-001 "ly ngua o" finds "Lý ngựa ô" (accent-free, case-insensitive) for a Guest', async () => {
      await published({ title: 'Lý ngựa ô' });
      const byKeyword = await F.get('/library/pieces?q=ly ngua o');
      expect(byKeyword.status).toBe(200);
      expect(F.titles(byKeyword)).toEqual(['Lý ngựa ô']);
      expect(byKeyword.body.data.items[0]).toMatchObject({ instrumentCount: 1, isSaved: false });
      const reordered = await F.get(`/library/pieces?q=${encodeURIComponent('NGỰA LÝ')}`);
      expect(reordered.status).toBe(200);
      expect(reordered.body.data.total).toBe(1);
    });

    it('ITC-LB-002 search by composer and by description', async () => {
      await published({ title: 'Lý ngựa ô' });
      await published({ title: 'Trống cơm', composer: 'Đặng Văn Hòa', description: 'Quan họ Bắc Ninh' });
      expect(F.titles(await F.get('/library/pieces?q=dang van hoa'))).toEqual(['Trống cơm']);
      expect((await F.get('/library/pieces?q=QUAN HO')).body.data.total).toBe(1);
    });

    it('ITC-LB-003 several values in one filter group are combined with OR', async () => {
      await threeGenreSongs();
      const response = await F.get(`/library/pieces?genreIds=${F.genre('Dân ca Nam Bộ')}&genreIds=${F.genre('Nhạc tài tử')}&sort=title_asc`);
      expect(response.status).toBe(200);
      expect(F.titles(response)).toEqual(['A', 'C']);
    });

    it('ITC-LB-004 different filter groups are combined with AND (genreIds[] and comma lists)', async () => {
      await threeGenreSongs();
      const response = await F.get(`/library/pieces?genreIds[]=${F.genre('Dân ca Nam Bộ')},${F.genre('Nhạc tài tử')}&levelIds[]=${F.level('Nâng cao')}`);
      expect(response.status).toBe(200);
      expect(F.titles(response)).toEqual(['C']);
    });

    it('ITC-LB-005 a filter with no result returns the MSG-07 empty state', async () => {
      await threeGenreSongs();
      const response = await F.get(`/library/pieces?instrumentIds=${sao}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ items: [], total: 0, totalPages: 1, emptyState: { code: 'MSG-07', message: 'Không tìm thấy bài hát phù hợp.' } });
    });

    it('ITC-LB-006 a library with no public song → MSG-06; filters list only active items', async () => {
      const empty = await F.get('/library/pieces?q=abc');
      expect(empty.status).toBe(200);
      expect(empty.body.data.emptyState).toEqual({ code: 'MSG-06', message: 'Thư viện chưa có bài hát.' });

      const filters = await F.get('/library/filters');
      expect(filters.status).toBe(200);
      const { genres, levels, instruments } = filters.body.data;
      expect(genres).toHaveLength(3);
      expect(levels.map((level: { name: string }) => level.name)).toEqual(['Cơ bản', 'Trung cấp', 'Nâng cao']);
      expect(instruments).toHaveLength(3);
      for (const item of [...genres, ...levels, ...instruments]) expect(Object.keys(item).sort()).toEqual(['id', 'name']);
    });

    it('ITC-LB-016 search parameter validation: q ≤ 100, valid sort and pageSize', async () => {
      F.expectValidationError(await F.get(`/library/pieces?q=${'a'.repeat(101)}`), 'q');
      F.expectValidationError(await F.get('/library/pieces?sort=popular'), 'sort');
      F.expectValidationError(await F.get('/library/pieces?pageSize=101'), 'pageSize');
      const atLimit = await F.get(`/library/pieces?pageSize=100&q=${'a'.repeat(100)}`);
      expect(atLimit.status).toBe(200);
      expect(atLimit.body.data.pageSize).toBe(100);
    });

    it('ITC-LB-017 admin-hidden and soft-deleted songs are not listed', async () => {
      const { a, b } = await threeGenreSongs();
      await prisma.piece.update({ where: { id: a.piece.id }, data: { moderation: 'ADMIN_HIDDEN' } });
      await prisma.piece.update({ where: { id: b.piece.id }, data: { deletedAt: new Date() } });
      const response = await F.get('/library/pieces?sort=title_asc');
      expect(response.status).toBe(200);
      expect(F.titles(response)).toEqual(['C']);
    });

    it('ITC-LB-018 filters no longer include an inactive instrument or genre', async () => {
      await prisma.instrument.update({ where: { id: bau }, data: { isActive: false } });
      await prisma.category.update({ where: { id: F.genre('Nhạc tài tử') }, data: { status: 'INACTIVE' } });
      const filters = await F.get('/library/filters');
      expect(filters.status).toBe(200);
      expect(filters.body.data.instruments.map((item: { name: string }) => item.name)).toEqual(['Đàn tranh', 'Sáo trúc']);
      expect(filters.body.data.genres.map((item: { name: string }) => item.name)).not.toContain('Nhạc tài tử');
    });

    it('ITC-LB-019 an invalid token on the public API → 401 instead of Guest', async () => {
      F.expectUnauthorized(await F.get('/library/pieces').set('Authorization', 'Bearer abc.def.ghi'));
      expect((await F.get('/library/pieces')).status).toBe(200);
    });
  });

  describe('Paging and sorting (GET /api/v1/library/pieces)', () => {
    it('ITC-LB-007 12 songs per page, newest first by default', async () => {
      await thirteenSongs();
      const firstPage = await F.get('/library/pieces');
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data).toMatchObject({ total: 13, page: 1, pageSize: 12, totalPages: 2 });
      expect(firstPage.body.data.items).toHaveLength(12);
      expect(firstPage.body.data.items[0].title).toBe('N');
      expect(F.titles(await F.get('/library/pieces?page=2'))).toEqual(['Ă']);
      const afterLast = await F.get('/library/pieces?page=3');
      expect(afterLast.status).toBe(200);
      expect(afterLast.body.data).toMatchObject({ items: [], total: 13 });
    });

    it('ITC-LB-008 title asc / desc uses the accent-free title, then the original title', async () => {
      await thirteenSongs();
      const ascending = await F.get('/library/pieces?sort=title_asc&pageSize=20');
      expect(ascending.status).toBe(200);
      expect(F.titles(ascending).slice(0, 5)).toEqual(['A', 'Ă', 'B', 'C', 'Đ']);
      const descending = await F.get('/library/pieces?sort=title_desc&pageSize=20');
      expect(descending.status).toBe(200);
      expect(descending.body.data.items[0].title).toBe('N');
    });

    it('ITC-LB-009 the instrument count only counts instruments with a public sheet', async () => {
      const { piece } = await published();
      const saoSheet = await F.createSheetOrThrow(gvA, piece.id, { name: 'Sáo', instrumentId: sao, kind: 'LEVEL', visibility: 'HIDDEN' });
      expect((await F.get('/library/pieces')).body.data.items[0].instrumentCount).toBe(1);
      expect((await F.patch(`/lecturer/sheet-music/${saoSheet.id}/visibility`, { visibility: 'PUBLIC' }, gvA)).status).toBe(200);
      expect((await F.get('/library/pieces')).body.data.items[0].instrumentCount).toBe(2);
    });

    it('ITC-LB-020 title sort with O / Ô / Ơ follows the accent-free title', async () => {
      for (const title of ['Ơn nghĩa', 'Ô mai', 'Ong vàng']) {
        const piece = await TestContext.createPiece(gvA, { title });
        await F.setPieceVisibility(gvA, piece.id, 'PUBLIC');
      }
      const response = await F.get('/library/pieces?sort=title_asc');
      expect(response.status).toBe(200);
      expect(F.titles(response)).toEqual(['Ô mai', 'Ơn nghĩa', 'Ong vàng']);
    });
  });

  describe('Song detail (GET /api/v1/library/pieces/:id)', () => {
    it('ITC-LB-010 tabs per instrument, main + level sheets, hidden sheets not shown, no ensemble with 1 instrument', async () => {
      const { piece } = await published();
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Nâng cao', levelId: F.level('Nâng cao') });
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Ẩn', visibility: 'HIDDEN' });

      const detail = await F.get(`/library/pieces/${piece.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ instrumentCount: 1, isSaved: false, canPracticeEnsemble: false, defaultInstrumentId: tranh });
      const [tab] = detail.body.data.tabs;
      expect(tab).toMatchObject({ sheetMusicCount: 2, main: { isMain: true, durationSec: 6, referenceAudio: { isFallback: false } }, others: [{ name: 'Nâng cao' }] });
      expect(tab.main.referenceAudio.url).toContain('/uploads/audio/');
    });

    it('ITC-LB-011 a song that is not public → 404 MSG-08', async () => {
      const piece = await TestContext.createPiece(gvA);
      F.expectError(await F.get(`/library/pieces/${piece.id}`), 404, { code: 'MSG-08', message: M.pieceNotPublic });
    });

    it('ITC-LB-012 the default tab is the student class instrument when the song has it (R-07)', async () => {
      const { piece } = await published();
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Sáo', instrumentId: sao, kind: 'LEVEL' });
      const sv1 = await studentInClass('sv.1@test.local', sao);
      const sv2 = await studentInClass('sv.2@test.local', bau);

      expect((await F.get(`/library/pieces/${piece.id}`)).body.data.defaultInstrumentId).toBe(tranh);
      expect((await F.get(`/library/pieces/${piece.id}`, sv1)).body.data.defaultInstrumentId).toBe(sao);
      expect((await F.get(`/library/pieces/${piece.id}`, sv2)).body.data.defaultInstrumentId).toBe(tranh);
    });

    it('ITC-LB-021 ensemble practice needs at least 2 instruments with a main sheet + recording', async () => {
      const { piece } = await published();
      const saoMain = await F.createSheetOrThrow(gvA, piece.id, { name: 'Sáo chính', instrumentId: sao });
      await F.createSheetOrThrow(gvA, piece.id, { name: 'Sáo dễ', instrumentId: sao, kind: 'LEVEL', visibility: 'PUBLIC' });

      const before = await F.get(`/library/pieces/${piece.id}`);
      expect(before.status).toBe(200);
      expect(before.body.data).toMatchObject({ instrumentCount: 2, canPracticeEnsemble: false });
      const saoTab = before.body.data.tabs.find((tab: { instrument: { id: string } }) => tab.instrument.id === sao);
      expect(saoTab.main).toBeNull();

      expect((await F.put(`/lecturer/sheet-music/${saoMain.id}/files/audio`, { fileId: await F.wav(gvA, 6) }, gvA)).status).toBe(200);
      expect((await F.patch(`/lecturer/sheet-music/${saoMain.id}/visibility`, { visibility: 'PUBLIC' }, gvA)).status).toBe(200);
      const after = await F.get(`/library/pieces/${piece.id}`);
      expect(after.body.data.canPracticeEnsemble).toBe(true);
    });

    it('ITC-LB-022 a public song without public sheets opens with no tab', async () => {
      const piece = await TestContext.createPiece(gvA);
      await F.setPieceVisibility(gvA, piece.id, 'PUBLIC');
      const detail = await F.get(`/library/pieces/${piece.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ instrumentCount: 0, tabs: [], defaultInstrumentId: null, canPracticeEnsemble: false });
    });

    it('ITC-LB-023 a lecturer browsing the library always gets isSaved = false', async () => {
      const { piece } = await published();
      const detail = await F.get(`/library/pieces/${piece.id}`, gvA);
      expect(detail.status).toBe(200);
      expect(detail.body.data.isSaved).toBe(false);
      expect(detail.body.data.tabs[0].main.isSaved).toBe(false);
      const list = await F.get('/library/pieces', gvA);
      expect(list.status).toBe(200);
      expect(list.body.data.items[0].isSaved).toBe(false);
    });
  });

  describe('View a sheet (GET /api/v1/library/sheet-music/:id)', () => {
    it('ITC-LB-013 a level sheet without recording uses the main recording and cannot be practised', async () => {
      const { mainSheetId, levelSheetId } = await mainAndLevelSheet();
      const viewer = await F.get(`/library/sheet-music/${levelSheetId}`);
      expect(viewer.status).toBe(200);
      expect(viewer.body.data).toMatchObject({
        referenceAudio: { isFallback: true, durationSec: 6 },
        sheetFile: { pageCount: 3, mimeType: 'application/pdf' },
        practice: { isAvailable: false, reason: 'Hãy luyện bản chính của nhạc cụ này.' },
        defaultMediaTab: 'REFERENCE_AUDIO',
        tutorialVideo: null
      });
      const mainSheet = await prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheetId }, include: { referenceAudio: true } });
      const audio = await F.fetchPublicUrl(viewer.body.data.referenceAudio.url);
      expect(audio.status).toBe(200);
      expect(Number(audio.headers['content-length'])).toBe(mainSheet.referenceAudio!.sizeBytes);
    });

    it('ITC-LB-014 a sheet of a hidden song cannot be opened (R-04)', async () => {
      const { piece, mainSheetId } = await mainAndLevelSheet();
      expect((await F.setPieceVisibility(gvA, piece.id, 'HIDDEN')).status).toBe(200);
      F.expectError(await F.get(`/library/sheet-music/${mainSheetId}`), 404, { code: 'MSG-08', message: M.sheetNotPublic });
    });

    it('ITC-LB-024 the main sheet viewer is "being prepared" without analysis file, practisable with one', async () => {
      const { mainSheetId } = await mainAndLevelSheet();
      const preparing = await F.get(`/library/sheet-music/${mainSheetId}`);
      expect(preparing.status).toBe(200);
      expect(preparing.body.data.practice).toEqual({ isAvailable: false, reason: 'Bản nhạc đang được chuẩn bị, vui lòng quay lại sau.' });

      await prisma.sheetMusic.update({ where: { id: mainSheetId }, data: { analysisStatus: 'READY', analysisFileUrl: 'http://localhost:3000/uploads/analysis/s1.json', analysisError: null } });
      const ready = await F.get(`/library/sheet-music/${mainSheetId}`);
      expect(ready.status).toBe(200);
      expect(ready.body.data.practice).toEqual({ isAvailable: true, reason: null });
    });

    it('ITC-LB-025 a HIDDEN or admin-hidden sheet in a public song cannot be opened', async () => {
      const { mainSheetId, levelSheetId } = await mainAndLevelSheet();
      await prisma.sheetMusic.update({ where: { id: levelSheetId }, data: { visibility: 'HIDDEN' } });
      await prisma.sheetMusic.update({ where: { id: mainSheetId }, data: { moderation: 'ADMIN_HIDDEN' } });
      F.expectError(await F.get(`/library/sheet-music/${levelSheetId}`), 404, { code: 'MSG-08', message: M.sheetNotPublic });
      F.expectError(await F.get(`/library/sheet-music/${mainSheetId}`), 404, { code: 'MSG-08', message: M.sheetNotPublic });
    });
  });

  describe('Top songs this week (GET /api/v1/library/pieces/trending)', () => {
    it('ITC-LB-015 ranked by this week submissions, ignoring last week and hidden songs', async () => {
      const student = await TestContext.createUser('STUDENT', 'sv.hot@test.local');
      const { piece: few } = await published({ title: 'Ít nộp' });
      const { piece: many } = await published({ title: 'Nhiều nộp' });
      const { piece: hidden } = await published({ title: 'Đã ẩn' });
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await addSubmissions(student.id, few.id, 1);
      await addSubmissions(student.id, few.id, 2, eightDaysAgo);
      await addSubmissions(student.id, many.id, 2);
      await addSubmissions(student.id, hidden.id, 3);
      expect((await F.setPieceVisibility(gvA, hidden.id, 'HIDDEN')).status).toBe(200);

      const trending = await F.get('/library/pieces/trending');
      expect(trending.status).toBe(200);
      expect(trending.body.data.weekStart).toBe(F.vietnamWeekStartText());
      expect(trendingRows(trending)).toEqual([['Nhiều nộp', 2], ['Ít nộp', 1]]);
      expect(trending.body.data.items[0]).toMatchObject({ instrumentCount: 1, isSaved: false });
      expect(trending.body.data.items[0].description).toBeTruthy();
    });

    it('ITC-LB-026 at most 5 songs, highest first', async () => {
      const student = await TestContext.createUser('STUDENT', 'sv.hot@test.local');
      for (let count = 1; count <= 6; count += 1) {
        const { piece } = await published({ title: `Bài ${count}` });
        await addSubmissions(student.id, piece.id, count);
      }
      const trending = await F.get('/library/pieces/trending');
      expect(trending.status).toBe(200);
      expect(trending.body.data.items.map((item: TrendingItem) => item.weeklySubmissionCount)).toEqual([6, 5, 4, 3, 2]);
    });

    it('ITC-LB-027 week boundary in Vietnam time: Sunday 23:59:59 does not count, Monday 00:00 does', async () => {
      const student = await TestContext.createUser('STUDENT', 'sv.hot@test.local');
      const { piece: x } = await published({ title: 'X' });
      const { piece: y } = await published({ title: 'Y' });
      const weekStart = F.vietnamWeekStart();
      await addSubmissions(student.id, x.id, 1, new Date(weekStart.getTime() - 1000));
      await addSubmissions(student.id, y.id, 1, weekStart);
      const trending = await F.get('/library/pieces/trending');
      expect(trending.status).toBe(200);
      expect(trendingRows(trending)).toEqual([['Y', 1]]);
    });

    it('ITC-LB-028 trending is empty when there is no submission this week', async () => {
      await published();
      const trending = await F.get('/library/pieces/trending');
      expect(trending.status).toBe(200);
      expect(trending.body.data).toMatchObject({ weekStart: F.vietnamWeekStartText(), items: [] });
    });
  });

  describe('Library filters (GET /api/v1/library/filters)', () => {
    it('ITC-LB-029 filter lists: only active items, sorted, no sign-in needed', async () => {
      const filters = await F.get('/library/filters');
      expect(filters.status).toBe(200);
      const { genres, levels, instruments } = filters.body.data;
      expect(instruments.map((item: { name: string }) => item.name)).toEqual(['Đàn bầu', 'Đàn tranh', 'Sáo trúc']);
      expect(genres.map((item: { name: string }) => item.name)).toEqual(['Dân ca Nam Bộ', 'Dân ca Bắc Bộ', 'Nhạc tài tử']);
      expect(levels.map((item: { name: string }) => item.name)).toEqual(['Cơ bản', 'Trung cấp', 'Nâng cao']);
      for (const item of [...genres, ...levels, ...instruments]) expect(Object.keys(item).sort()).toEqual(['id', 'name']);
      expect((await F.get('/library/filters').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(200);
    });
  });
});
