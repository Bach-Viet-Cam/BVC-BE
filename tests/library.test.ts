import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import StudentClassService from '../src/modules/music-library/service/StudentClassService.ts';
import TestContext from './support/TestContext.ts';

const { app, api } = TestContext;

describe('UC-07 / UC-08 Thư viện công khai', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;

  beforeEach(async () => {
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'gv@test.local');
  });

  afterEach(() => StudentClassService.useActiveInstrumentResolver(async () => null));

  it('tìm "ly ngua o" ra "Lý ngựa ô" (không phân biệt dấu, hoa thường; cả tác giả và mô tả)', async () => {
    await TestContext.createPublishedPiece(lecturer, { title: 'Lý ngựa ô' });
    await TestContext.createPublishedPiece(lecturer, { title: 'Trống cơm', composer: 'Đặng Văn Hòa', description: 'Quan họ Bắc Ninh' });

    const byTitle = await request(app).get(`${api}/library/pieces`).query({ q: 'ly ngua o' });
    expect(byTitle.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Lý ngựa ô']);
    const byComposer = await request(app).get(`${api}/library/pieces`).query({ q: 'dang van hoa' });
    expect(byComposer.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Trống cơm']);
    const byDescription = await request(app).get(`${api}/library/pieces`).query({ q: 'QUAN HO' });
    expect(byDescription.body.data.total).toBe(1);
  });

  it('lọc nhiều điều kiện kết hợp đúng (OR trong cùng nhóm, AND giữa các nhóm)', async () => {
    const { genres, levels, instruments } = TestContext.catalog;
    await TestContext.createPublishedPiece(lecturer, { title: 'A', genreId: genres['Dân ca Nam Bộ'], levelId: levels['Cơ bản'] });
    await TestContext.createPublishedPiece(lecturer, { title: 'B', genreId: genres['Dân ca Bắc Bộ'], levelId: levels['Cơ bản'] });
    await TestContext.createPublishedPiece(lecturer, { title: 'C', genreId: genres['Nhạc tài tử'], levelId: levels['Nâng cao'] });

    const twoGenres = await request(app).get(`${api}/library/pieces`)
      .query(`genreIds=${genres['Dân ca Nam Bộ']}&genreIds=${genres['Nhạc tài tử']}&sort=title_asc`);
    expect(twoGenres.body.data.items.map((item: { title: string }) => item.title)).toEqual(['A', 'C']);

    const genreAndLevel = await request(app).get(`${api}/library/pieces`)
      .query(`genreIds[]=${genres['Dân ca Nam Bộ']},${genres['Nhạc tài tử']}&levelIds[]=${levels['Nâng cao']}`);
    expect(genreAndLevel.body.data.items.map((item: { title: string }) => item.title)).toEqual(['C']);

    const byInstrument = await request(app).get(`${api}/library/pieces`).query({ instrumentIds: instruments.SAO_TRUC });
    expect(byInstrument.body.data.total).toBe(0);
    expect(byInstrument.body.data.emptyState.code).toBe('MSG-07');
  });

  it('12 bài / trang và 3 kiểu sắp xếp đúng', async () => {
    const titles = ['Ă', 'B', 'Đ', 'A', 'C', 'E', 'G', 'H', 'I', 'K', 'L', 'M', 'N'];
    for (const title of titles) {
      const piece = await TestContext.createPiece(lecturer, { title });
      await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`).set(TestContext.auth(lecturer)).send({ visibility: 'PUBLIC' });
    }
    const firstPage = await request(app).get(`${api}/library/pieces`);
    expect(firstPage.body.data).toMatchObject({ total: 13, page: 1, pageSize: 12, totalPages: 2 });
    expect(firstPage.body.data.items).toHaveLength(12);
    expect(firstPage.body.data.items[0].title).toBe('N');

    const secondPage = await request(app).get(`${api}/library/pieces`).query({ page: 2 });
    expect(secondPage.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Ă']);

    const ascending = await request(app).get(`${api}/library/pieces`).query({ sort: 'title_asc', pageSize: 20 });
    expect(ascending.body.data.items.slice(0, 5).map((item: { title: string }) => item.title)).toEqual(['A', 'Ă', 'B', 'C', 'Đ']);
    const descending = await request(app).get(`${api}/library/pieces`).query({ sort: 'title_desc', pageSize: 20 });
    expect(descending.body.data.items[0].title).toBe('N');
  });

  it('"<n> nhạc cụ" chỉ đếm nhạc cụ có bản công khai', async () => {
    const { piece } = await TestContext.createPublishedPiece(lecturer);
    await TestContext.createSheet(lecturer, piece.id, { name: 'Sáo ẩn', instrumentId: TestContext.catalog.instruments.SAO_TRUC, kind: 'LEVEL', visibility: 'HIDDEN' });
    const list = await request(app).get(`${api}/library/pieces`);
    expect(list.body.data.items[0].instrumentCount).toBe(1);

    await TestContext.createSheet(lecturer, piece.id, { name: 'Sáo công khai', instrumentId: TestContext.catalog.instruments.SAO_TRUC, kind: 'LEVEL' });
    const listAfter = await request(app).get(`${api}/library/pieces`);
    expect(listAfter.body.data.items[0].instrumentCount).toBe(2);
  });

  it('chi tiết bài hát: tab theo nhạc cụ, bản chính + bản theo độ khó; bản ẩn không hiện', async () => {
    const { piece, mainSheet } = await TestContext.createPublishedPiece(lecturer);
    await TestContext.createSheet(lecturer, piece.id, { name: 'Nâng cao', levelId: TestContext.catalog.levels['Nâng cao'] });
    await TestContext.createSheet(lecturer, piece.id, { name: 'Ẩn', visibility: 'HIDDEN' });

    const detail = await request(app).get(`${api}/library/pieces/${piece.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ instrumentCount: 1, canPracticeEnsemble: true, isSaved: false });
    expect(detail.body.data.tabs).toHaveLength(1);
    const [tab] = detail.body.data.tabs;
    expect(tab).toMatchObject({ sheetMusicCount: 2 });
    expect(tab.main).toMatchObject({ id: mainSheet.id, isMain: true, durationSec: 6 });
    expect(tab.main.referenceAudio.url).toContain('/storage/local/');
    expect(tab.others.map((other: { name: string }) => other.name)).toEqual(['Nâng cao']);
  });

  it('bài không còn công khai → 404 MSG-08', async () => {
    const piece = await TestContext.createPiece(lecturer);
    const response = await request(app).get(`${api}/library/pieces/${piece.id}`);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'MSG-08', message: 'Không thể mở bài hát vì bài hát không còn công khai.' });
  });

  it('bản theo độ khó không có bản thu → viewer trả audio của bản chính', async () => {
    const { piece, mainSheet } = await TestContext.createPublishedPiece(lecturer);
    const levelSheet = await TestContext.createSheet(lecturer, piece.id, { name: 'Dễ' });
    const viewer = await request(app).get(`${api}/library/sheet-music/${levelSheet.body.data.id}`);
    expect(viewer.status).toBe(200);
    expect(viewer.body.data.referenceAudio).toMatchObject({ isFallback: true, durationSec: 6 });
    expect(viewer.body.data.sheetFile).toMatchObject({ pageCount: 3, mimeType: 'application/pdf' });
    expect(viewer.body.data.practice.isAvailable).toBe(false);
    expect(viewer.body.data.defaultMediaTab).toBe('REFERENCE_AUDIO');

    const mainSheetRecord = await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheet.id }, include: { referenceAudio: true } });
    const audio = await request(app).get(new URL(viewer.body.data.referenceAudio.url).pathname);
    expect(audio.status).toBe(200);
    expect(Number(audio.headers['content-length'])).toBe(mainSheetRecord.referenceAudio!.sizeBytes);
  });

  it('bản nhạc của bài bị ẩn không mở được ở viewer (R-04)', async () => {
    const { piece, mainSheet } = await TestContext.createPublishedPiece(lecturer);
    await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`).set(TestContext.auth(lecturer)).send({ visibility: 'HIDDEN' });
    expect((await request(app).get(`${api}/library/sheet-music/${mainSheet.id}`)).status).toBe(404);
  });

  it('tab mặc định là nhạc cụ của lớp sinh viên nếu bài có nhạc cụ đó', async () => {
    const { instruments } = TestContext.catalog;
    const { piece } = await TestContext.createPublishedPiece(lecturer);
    await TestContext.createSheet(lecturer, piece.id, { name: 'Sáo', instrumentId: instruments.SAO_TRUC, kind: 'LEVEL' });
    const student = await TestContext.createUser('STUDENT', 'sv@test.local');

    const guestDetail = await request(app).get(`${api}/library/pieces/${piece.id}`);
    expect(guestDetail.body.data.defaultInstrumentId).toBe(instruments.DAN_TRANH);

    StudentClassService.useActiveInstrumentResolver(async (studentId) => (studentId === student.id ? instruments.SAO_TRUC : null));
    const studentDetail = await request(app).get(`${api}/library/pieces/${piece.id}`).set(TestContext.auth(student));
    expect(studentDetail.body.data.defaultInstrumentId).toBe(instruments.SAO_TRUC);

    StudentClassService.useActiveInstrumentResolver(async () => instruments.DAN_BAU);
    const fallbackDetail = await request(app).get(`${api}/library/pieces/${piece.id}`).set(TestContext.auth(student));
    expect(fallbackDetail.body.data.defaultInstrumentId).toBe(instruments.DAN_TRANH);
  });

  it('thư viện trống → MSG-06; bộ lọc trả về danh mục và nhạc cụ đang hoạt động', async () => {
    const empty = await request(app).get(`${api}/library/pieces`).query({ q: 'abc' });
    expect(empty.body.data.emptyState).toEqual({ code: 'MSG-06', message: 'Thư viện chưa có bài hát.' });
    const filters = await request(app).get(`${api}/library/filters`);
    expect(filters.body.data.levels.map((level: { name: string }) => level.name)).toEqual(['Cơ bản', 'Trung cấp', 'Nâng cao']);
    expect(filters.body.data.instruments).toHaveLength(3);
  });
});
