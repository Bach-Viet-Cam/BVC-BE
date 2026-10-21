import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from './support/TestContext.ts';

const { app, api } = TestContext;

describe('UC-08 Lưu bài hát / bản nhạc', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;
  let student: Awaited<ReturnType<typeof TestContext.createUser>>;

  beforeEach(async () => {
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'gv@test.local');
    student = await TestContext.createUser('STUDENT', 'sv@test.local');
  });

  it('guest gọi API lưu → 401; giảng viên → 403', async () => {
    const { piece } = await TestContext.createPublishedPiece(lecturer);
    expect((await request(app).put(`${api}/me/saved/pieces/${piece.id}`)).status).toBe(401);
    expect((await request(app).put(`${api}/me/saved/pieces/${piece.id}`).set(TestContext.auth(lecturer))).status).toBe(403);
  });

  it('lưu hai lần không tạo trùng; isSaved hiện ở thư viện; bỏ lưu', async () => {
    const { piece } = await TestContext.createPublishedPiece(lecturer);
    const firstSave = await request(app).put(`${api}/me/saved/pieces/${piece.id}`).set(TestContext.auth(student));
    expect(firstSave.body.message).toBe('Lưu bài hát thành công.');
    await request(app).put(`${api}/me/saved/pieces/${piece.id}`).set(TestContext.auth(student)).expect(200);
    expect(await TestContext.prisma.savedItem.count()).toBe(1);

    const library = await request(app).get(`${api}/library/pieces`).set(TestContext.auth(student));
    expect(library.body.data.items[0].isSaved).toBe(true);
    const guestLibrary = await request(app).get(`${api}/library/pieces`);
    expect(guestLibrary.body.data.items[0].isSaved).toBe(false);

    const unsave = await request(app).delete(`${api}/me/saved/pieces/${piece.id}`).set(TestContext.auth(student));
    expect(unsave.body.message).toBe('Bỏ lưu bài hát thành công.');
    expect(await TestContext.prisma.savedItem.count()).toBe(0);
  });

  it('màn "Đã lưu": 2 tab với số lượng, mới lưu trước', async () => {
    const { piece: firstPiece, mainSheet } = await TestContext.createPublishedPiece(lecturer, { title: 'Bài 1' });
    const { piece: secondPiece } = await TestContext.createPublishedPiece(lecturer, { title: 'Bài 2' });
    await request(app).put(`${api}/me/saved/pieces/${firstPiece.id}`).set(TestContext.auth(student)).expect(200);
    await request(app).put(`${api}/me/saved/pieces/${secondPiece.id}`).set(TestContext.auth(student)).expect(200);
    await request(app).put(`${api}/me/saved/sheet-music/${mainSheet.id}`).set(TestContext.auth(student)).expect(200);

    const pieces = await request(app).get(`${api}/me/saved`).set(TestContext.auth(student));
    expect(pieces.body.data.counts).toEqual({ PIECE: 2, SHEET_MUSIC: 1 });
    expect(pieces.body.data.items.map((item: { piece: { title: string } }) => item.piece.title)).toEqual(['Bài 2', 'Bài 1']);
    expect(pieces.body.data.items[0].piece.genre.name).toBe('Dân ca Nam Bộ');

    const sheets = await request(app).get(`${api}/me/saved`).query({ type: 'SHEET_MUSIC' }).set(TestContext.auth(student));
    expect(sheets.body.data.items[0]).toMatchObject({ sheetMusic: { id: mainSheet.id, name: 'Bản chính' }, piece: { title: 'Bài 1' } });
  });

  it('ẩn bài đã lưu → biến mất khỏi /me/saved, hiện lại khi công khai lại', async () => {
    const { piece, mainSheet } = await TestContext.createPublishedPiece(lecturer);
    await request(app).put(`${api}/me/saved/pieces/${piece.id}`).set(TestContext.auth(student)).expect(200);
    await request(app).put(`${api}/me/saved/sheet-music/${mainSheet.id}`).set(TestContext.auth(student)).expect(200);

    await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`).set(TestContext.auth(lecturer)).send({ visibility: 'HIDDEN' });
    const hidden = await request(app).get(`${api}/me/saved`).set(TestContext.auth(student));
    expect(hidden.body.data.counts).toEqual({ PIECE: 0, SHEET_MUSIC: 0 });
    expect(hidden.body.data.emptyState.code).toBe('MSG-06');
    expect(await TestContext.prisma.savedItem.count()).toBe(2);

    await request(app).patch(`${api}/lecturer/pieces/${piece.id}/visibility`).set(TestContext.auth(lecturer)).send({ visibility: 'PUBLIC' });
    const shownAgain = await request(app).get(`${api}/me/saved`).set(TestContext.auth(student));
    expect(shownAgain.body.data.counts).toEqual({ PIECE: 1, SHEET_MUSIC: 1 });
  });

  it('bài "Admin đã ẩn" không xuất hiện trong danh sách đã lưu', async () => {
    const { piece } = await TestContext.createPublishedPiece(lecturer);
    await request(app).put(`${api}/me/saved/pieces/${piece.id}`).set(TestContext.auth(student)).expect(200);
    await TestContext.prisma.piece.update({ where: { id: piece.id }, data: { moderation: 'ADMIN_HIDDEN' } });
    const saved = await request(app).get(`${api}/me/saved`).set(TestContext.auth(student));
    expect(saved.body.data.total).toBe(0);
  });

  it('không lưu được bài / bản nhạc không công khai (404)', async () => {
    const piece = await TestContext.createPiece(lecturer);
    expect((await request(app).put(`${api}/me/saved/pieces/${piece.id}`).set(TestContext.auth(student))).status).toBe(404);
  });
});
