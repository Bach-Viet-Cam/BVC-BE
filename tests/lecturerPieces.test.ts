import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from './support/TestContext.ts';

const { app, api } = TestContext;

describe('UC-05 Quản lý bài hát (giảng viên)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;

  beforeEach(async () => {
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'gv.a@test.local');
  });

  it('thiếu "Tiêu đề" → 400 MSG-35; tiêu đề 201 ký tự → MSG-37', async () => {
    const basePayload = {
      genreId: TestContext.catalog.genres['Dân ca Nam Bộ'],
      levelId: TestContext.catalog.levels['Cơ bản'],
      instrumentIds: [TestContext.catalog.instruments.DAN_TRANH]
    };
    const missingTitle = await request(app).post(`${api}/lecturer/pieces`).set(TestContext.auth(lecturer)).send(basePayload);
    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body).toMatchObject({ code: 'MSG-35', field: 'title', message: 'Tiêu đề không được để trống.' });

    const longTitle = await request(app).post(`${api}/lecturer/pieces`).set(TestContext.auth(lecturer))
      .send({ ...basePayload, title: 'a'.repeat(201) });
    expect(longTitle.status).toBe(400);
    expect(longTitle.body).toMatchObject({ code: 'MSG-37', field: 'title', message: 'Tiêu đề không được vượt quá 200 ký tự.' });

    const noInstrument = await request(app).post(`${api}/lecturer/pieces`).set(TestContext.auth(lecturer))
      .send({ ...basePayload, title: 'Bài', instrumentIds: [] });
    expect(noInstrument.body).toMatchObject({ code: 'MSG-35', field: 'instrumentIds' });
  });

  it('bài hát mới mặc định "Đã ẩn" và không xuất hiện ở thư viện', async () => {
    const piece = await TestContext.createPiece(lecturer);
    const detail = await request(app).get(`${api}/lecturer/pieces/${piece.id}`).set(TestContext.auth(lecturer));
    expect(detail.body.data.visibility).toBe('HIDDEN');
    const library = await request(app).get(`${api}/library/pieces`);
    expect(library.body.data.items).toHaveLength(0);
  });

  it('đặt "Công khai" khi chưa có bản công khai → 200 kèm warning MSG-46', async () => {
    const piece = await TestContext.createPiece(lecturer);
    const response = await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`)
      .set(TestContext.auth(lecturer)).send({ visibility: 'PUBLIC' });
    expect(response.status).toBe(200);
    expect(response.body.data.warning.code).toBe('MSG-46');
    expect(response.body.data.piece.visibility).toBe('PUBLIC');
    expect(response.body.message).toBe('Hiện bài hát thành công.');
  });

  it('không có cảnh báo khi đã có bản nhạc công khai', async () => {
    const { piece } = await TestContext.createPublishedPiece(lecturer);
    const response = await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`)
      .set(TestContext.auth(lecturer)).send({ visibility: 'PUBLIC' });
    expect(response.body.data.warning).toBeNull();
  });

  it('giảng viên B không xem / sửa được bài của giảng viên A (403)', async () => {
    const otherLecturer = await TestContext.createUser('LECTURER', 'gv.b@test.local');
    const piece = await TestContext.createPiece(lecturer);
    const view = await request(app).get(`${api}/lecturer/pieces/${piece.id}`).set(TestContext.auth(otherLecturer));
    expect(view.status).toBe(403);
    const hide = await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`)
      .set(TestContext.auth(otherLecturer)).send({ visibility: 'PUBLIC' });
    expect(hide.status).toBe(403);
    const list = await request(app).get(`${api}/lecturer/pieces`).set(TestContext.auth(otherLecturer));
    expect(list.body.data.total).toBe(0);
  });

  it('sinh viên không gọi được API giảng viên (403), guest → 401', async () => {
    const student = await TestContext.createUser('STUDENT', 'sv@test.local');
    expect((await request(app).get(`${api}/lecturer/pieces`).set(TestContext.auth(student))).status).toBe(403);
    expect((await request(app).get(`${api}/lecturer/pieces`)).status).toBe(401);
  });

  it('bài "Admin đã ẩn": đổi hiển thị → 409, không xuất hiện trong thư viện', async () => {
    const { piece } = await TestContext.createPublishedPiece(lecturer);
    await TestContext.prisma.piece.update({ where: { id: piece.id }, data: { moderation: 'ADMIN_HIDDEN', moderationReason: 'Vi phạm bản quyền' } });

    const toggle = await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`)
      .set(TestContext.auth(lecturer)).send({ visibility: 'HIDDEN' });
    expect(toggle.status).toBe(409);
    expect(toggle.body.code).toBe('MSG-08');

    const detail = await request(app).get(`${api}/lecturer/pieces/${piece.id}`).set(TestContext.auth(lecturer));
    expect(detail.body.data).toMatchObject({ effectiveVisibility: 'ADMIN_HIDDEN', canChangeVisibility: false, moderationReason: 'Vi phạm bản quyền' });

    const library = await request(app).get(`${api}/library/pieces`);
    expect(library.body.data.items).toHaveLength(0);
    expect((await request(app).get(`${api}/library/pieces/${piece.id}`)).status).toBe(404);
  });

  it('lọc / tìm kiếm danh sách giảng viên theo tên không dấu, hiển thị, nhạc cụ', async () => {
    await TestContext.createPiece(lecturer, { title: 'Lý ngựa ô' });
    await TestContext.createPiece(lecturer, { title: 'Trống cơm', composer: 'Dân gian Bắc Bộ' });
    const { piece: published } = await TestContext.createPublishedPiece(lecturer, { title: 'Bèo dạt mây trôi' });

    const search = await request(app).get(`${api}/lecturer/pieces`).query({ q: 'NGUA O' }).set(TestContext.auth(lecturer));
    expect(search.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Lý ngựa ô']);

    const byComposer = await request(app).get(`${api}/lecturer/pieces`).query({ q: 'bac bo' }).set(TestContext.auth(lecturer));
    expect(byComposer.body.data.items.map((item: { title: string }) => item.title)).toEqual(['Trống cơm']);

    const publicOnly = await request(app).get(`${api}/lecturer/pieces`).query({ visibility: 'PUBLIC' }).set(TestContext.auth(lecturer));
    expect(publicOnly.body.data.items.map((item: { id: string }) => item.id)).toEqual([published.id]);

    const byInstrument = await request(app).get(`${api}/lecturer/pieces`)
      .query({ instrumentId: TestContext.catalog.instruments.DAN_TRANH }).set(TestContext.auth(lecturer));
    expect(byInstrument.body.data.total).toBe(1);

    const all = await request(app).get(`${api}/lecturer/pieces`).set(TestContext.auth(lecturer));
    expect(all.body.data).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(all.body.data.items[0].id).toBe(published.id);
    expect(all.body.data.items[0]).toMatchObject({ sheetMusicCount: 1, publicSheetMusicCount: 1 });
  });

  it('danh mục bị tắt: giữ tag cũ khi sửa, nhưng không chọn mới được', async () => {
    const piece = await TestContext.createPiece(lecturer);
    const genreId = TestContext.catalog.genres['Dân ca Nam Bộ'];
    await TestContext.prisma.category.update({ where: { id: genreId }, data: { status: 'INACTIVE' } });

    const keepTag = await request(app).put(`${api}/lecturer/pieces/${piece.id}`).set(TestContext.auth(lecturer)).send({
      title: 'Lý ngựa ô (sửa)',
      genreId,
      levelId: TestContext.catalog.levels['Cơ bản'],
      instrumentIds: [TestContext.catalog.instruments.DAN_TRANH, TestContext.catalog.instruments.SAO_TRUC]
    });
    expect(keepTag.status).toBe(200);
    expect(keepTag.body.data.piece.genre.id).toBe(genreId);

    const newPiece = await request(app).post(`${api}/lecturer/pieces`).set(TestContext.auth(lecturer)).send({
      title: 'Bài mới',
      genreId,
      levelId: TestContext.catalog.levels['Cơ bản'],
      instrumentIds: [TestContext.catalog.instruments.DAN_TRANH]
    });
    expect(newPiece.status).toBe(400);
    expect(newPiece.body.field).toBe('genreId');

    const filters = await request(app).get(`${api}/library/filters`);
    expect(filters.body.data.genres.map((genre: { id: string }) => genre.id)).not.toContain(genreId);
  });

  it('ảnh bìa: tải lên, thay, gỡ', async () => {
    const piece = await TestContext.createPiece(lecturer);
    const coverId = await TestContext.upload(lecturer, 'COVER', 'bia.png', 'image/png', Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'
    ));
    const withCover = await request(app).put(`${api}/lecturer/pieces/${piece.id}/cover`).set(TestContext.auth(lecturer)).send({ fileId: coverId });
    expect(withCover.status).toBe(200);
    expect(withCover.body.data.coverUrl).toContain('/api/v1/storage/local/');
    const image = await request(app).get(new URL(withCover.body.data.coverUrl).pathname);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');

    const removed = await request(app).delete(`${api}/lecturer/pieces/${piece.id}/cover`).set(TestContext.auth(lecturer));
    expect(removed.body.data.coverUrl).toBeNull();
    expect(await TestContext.prisma.mediaFile.findUnique({ where: { id: coverId } })).toBeNull();
  });
});
