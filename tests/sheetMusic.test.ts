import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import TestContext from './support/TestContext.ts';

const { app, api } = TestContext;

describe('UC-06 Quản lý bản nhạc (giảng viên)', () => {
  let lecturer: Awaited<ReturnType<typeof TestContext.createUser>>;
  let pieceId: string;

  beforeEach(async () => {
    await TestContext.reset();
    lecturer = await TestContext.createUser('LECTURER', 'gv@test.local');
    pieceId = (await TestContext.createPiece(lecturer)).id;
  });

  it('bản đầu tiên của nhạc cụ mặc định là bản chính; bản chính thứ hai → 409', async () => {
    const first = await TestContext.createSheet(lecturer, pieceId, { name: 'Bản 1', referenceAudioId: await TestContext.uploadWav(lecturer) });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ kind: 'MAIN', isMain: true, visibility: 'PUBLIC' });
    expect(first.body.message).toBe('Thêm bản nhạc thành công.');

    const defaultKind = await TestContext.createSheet(lecturer, pieceId, { name: 'Bản 2' });
    expect(defaultKind.body.data.kind).toBe('LEVEL');

    const secondMain = await TestContext.createSheet(lecturer, pieceId, { name: 'Bản 3', kind: 'MAIN' });
    expect(secondMain.status).toBe(409);
    expect(secondMain.body).toMatchObject({ code: 'MSG-08', field: 'kind' });

    const list = await request(app).get(`${api}/lecturer/pieces/${pieceId}/sheet-music`).set(TestContext.auth(lecturer));
    const danTranhOption = list.body.data.instrumentOptions.find((option: { id: string }) => option.id === TestContext.catalog.instruments.DAN_TRANH);
    const saoTrucOption = list.body.data.instrumentOptions.find((option: { id: string }) => option.id === TestContext.catalog.instruments.SAO_TRUC);
    expect(danTranhOption).toMatchObject({ hasMain: true, defaultKind: 'LEVEL' });
    expect(saoTrucOption).toMatchObject({ hasMain: false, defaultKind: 'MAIN' });
  });

  it('bản chính không có bản thu: lưu được (ẩn), đặt "Công khai" → 409', async () => {
    const created = await TestContext.createSheet(lecturer, pieceId, { name: 'Bản chính' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ isMain: true, visibility: 'HIDDEN', canPublish: false });

    const publish = await request(app).patch(`${api}/lecturer/sheet-music/${created.body.data.id}/visibility`)
      .set(TestContext.auth(lecturer)).send({ visibility: 'PUBLIC' });
    expect(publish.status).toBe(409);
    expect(publish.body.message).toBe('Không thể công khai bản nhạc vì bản chính cần bản thu mẫu trước khi công khai.');

    const explicitPublic = await TestContext.createSheet(lecturer, pieceId, {
      name: 'Bản chính sáo', instrumentId: TestContext.catalog.instruments.SAO_TRUC, visibility: 'PUBLIC'
    });
    expect(explicitPublic.status).toBe(409);
  });

  it('nhạc cụ không thuộc bài hát → 400; bỏ nhạc cụ đang có bản nhạc → MSG-08', async () => {
    const wrongInstrument = await TestContext.createSheet(lecturer, pieceId, { instrumentId: TestContext.catalog.instruments.DAN_BAU });
    expect(wrongInstrument.status).toBe(400);
    expect(wrongInstrument.body).toMatchObject({ code: 'MSG-08', field: 'instrumentId' });

    await TestContext.createSheet(lecturer, pieceId, { name: 'Bản đàn tranh' });
    const removeInstrument = await request(app).put(`${api}/lecturer/pieces/${pieceId}`).set(TestContext.auth(lecturer)).send({
      title: 'Lý ngựa ô',
      genreId: TestContext.catalog.genres['Dân ca Nam Bộ'],
      levelId: TestContext.catalog.levels['Cơ bản'],
      instrumentIds: [TestContext.catalog.instruments.SAO_TRUC]
    });
    expect(removeInstrument.status).toBe(409);
    expect(removeInstrument.body).toMatchObject({ code: 'MSG-08', message: 'Không thể bỏ nhạc cụ Đàn tranh vì nhạc cụ này vẫn còn bản nhạc.' });

    const removeUnused = await request(app).put(`${api}/lecturer/pieces/${pieceId}`).set(TestContext.auth(lecturer)).send({
      title: 'Lý ngựa ô',
      genreId: TestContext.catalog.genres['Dân ca Nam Bộ'],
      levelId: TestContext.catalog.levels['Cơ bản'],
      instrumentIds: [TestContext.catalog.instruments.DAN_TRANH]
    });
    expect(removeUnused.status).toBe(200);
    expect(removeUnused.body.data.piece.instruments).toHaveLength(1);
  });

  it('"Tên bản" trùng trong cùng bài hát → MSG-05 (không phân biệt hoa thường)', async () => {
    await TestContext.createSheet(lecturer, pieceId, { name: 'Bản dễ' });
    const duplicate = await TestContext.createSheet(lecturer, pieceId, { name: 'BẢN DỄ', instrumentId: TestContext.catalog.instruments.SAO_TRUC });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ code: 'MSG-05', field: 'name', message: 'Tên bản này đã được sử dụng.' });

    const otherPiece = await TestContext.createPiece(lecturer, { title: 'Bài khác' });
    expect((await TestContext.createSheet(lecturer, otherPiece.id, { name: 'Bản dễ' })).status).toBe(201);
  });

  it('thay file bản nhạc: id giữ nguyên, mục đã lưu vẫn trỏ đúng; thay bản thu cập nhật thời lượng', async () => {
    const { piece, mainSheet } = await TestContext.createPublishedPiece(lecturer, { title: 'Bài thay file' });
    const student = await TestContext.createUser('STUDENT', 'sv@test.local');
    await request(app).put(`${api}/me/saved/sheet-music/${mainSheet.id}`).set(TestContext.auth(student)).expect(200);
    const before = await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: mainSheet.id } });

    const newSheetFileId = await TestContext.uploadPdf(lecturer, 'New');
    const replaced = await request(app).put(`${api}/lecturer/sheet-music/${mainSheet.id}/files/sheet`)
      .set(TestContext.auth(lecturer)).send({ fileId: newSheetFileId });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.id).toBe(mainSheet.id);
    expect(replaced.body.data.files.sheet).toMatchObject({ id: newSheetFileId, pageCount: 3 });
    expect(await TestContext.prisma.mediaFile.findUnique({ where: { id: before.sheetFileId } })).toBeNull();

    const saved = await request(app).get(`${api}/me/saved`).query({ type: 'SHEET_MUSIC' }).set(TestContext.auth(student));
    expect(saved.body.data.items[0].sheetMusic.id).toBe(mainSheet.id);
    expect(saved.body.data.items[0].piece.id).toBe(piece.id);

    const enqueuedBefore = TestContext.queue.enqueued.length;
    const newAudioId = await TestContext.uploadWav(lecturer, 9);
    const audioReplaced = await request(app).put(`${api}/lecturer/sheet-music/${mainSheet.id}/files/audio`)
      .set(TestContext.auth(lecturer)).send({ fileId: newAudioId });
    expect(audioReplaced.body.data.durationSec).toBe(9);
    expect(TestContext.queue.enqueued.length).toBe(enqueuedBefore + 1);
  });

  it('thay file sai loại ô → 400; file đã dùng ở bản khác → 409', async () => {
    const created = await TestContext.createSheet(lecturer, pieceId, { name: 'Bản A' });
    const audioId = await TestContext.uploadWav(lecturer);
    const wrongSlot = await request(app).put(`${api}/lecturer/sheet-music/${created.body.data.id}/files/sheet`)
      .set(TestContext.auth(lecturer)).send({ fileId: audioId });
    expect(wrongSlot.status).toBe(400);

    const reused = await request(app).put(`${api}/lecturer/sheet-music/${created.body.data.id}/files/sheet`)
      .set(TestContext.auth(lecturer)).send({ fileId: (await TestContext.prisma.sheetMusic.findUniqueOrThrow({ where: { id: created.body.data.id } })).sheetFileId });
    expect(reused.status).toBe(409);
  });

  it('bản nhạc "Admin đã ẩn": giảng viên đổi hiển thị → 409', async () => {
    const created = await TestContext.createSheet(lecturer, pieceId, { name: 'Bản B', referenceAudioId: await TestContext.uploadWav(lecturer) });
    await TestContext.prisma.sheetMusic.update({ where: { id: created.body.data.id }, data: { moderation: 'ADMIN_HIDDEN' } });
    const toggle = await request(app).patch(`${api}/lecturer/sheet-music/${created.body.data.id}/visibility`)
      .set(TestContext.auth(lecturer)).send({ visibility: 'HIDDEN' });
    expect(toggle.status).toBe(409);
  });

  it('danh sách gom theo nhạc cụ: bản chính trước, rồi theo trình độ', async () => {
    const levels = TestContext.catalog.levels;
    await TestContext.createSheet(lecturer, pieceId, { name: 'Chính', referenceAudioId: await TestContext.uploadWav(lecturer) });
    await TestContext.createSheet(lecturer, pieceId, { name: 'Nâng cao', levelId: levels['Nâng cao'] });
    await TestContext.createSheet(lecturer, pieceId, { name: 'Cơ bản', levelId: levels['Cơ bản'] });
    const list = await request(app).get(`${api}/lecturer/pieces/${pieceId}/sheet-music`).set(TestContext.auth(lecturer));
    expect(list.body.data.total).toBe(3);
    expect(list.body.data.groups).toHaveLength(1);
    expect(list.body.data.groups[0].items.map((item: { name: string }) => item.name)).toEqual(['Chính', 'Cơ bản', 'Nâng cao']);
    expect(list.body.data.groups[0].items[1]).toMatchObject({ usesMainRecording: true, durationSec: null, analysis: null });
    expect(list.body.data.groups[0].items[0].analysis.status).toBe('PROCESSING');
  });
});
