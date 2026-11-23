import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import type { Response as ApiResponse } from 'supertest';
import { expect } from 'vitest';
import SampleMediaFactory from '../../../prisma/seed/SampleMediaFactory.ts';
import TestContext from '../../support/TestContext.ts';

type TestUser = Awaited<ReturnType<typeof TestContext.createUser>>;

export default class MusicLibraryFixture {
  static readonly zeroId = '00000000-0000-0000-0000-000000000000';
  static readonly storageRoot = path.resolve('storage-test');

  static readonly messages = {
    unauthorized: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    forbidden: 'Bạn không có quyền thực hiện thao tác này.',
    pieceNotOwner: 'Không thể sửa bài hát vì chỉ chủ bài mới sửa được.',
    invalidData: 'Kiểm tra lại dữ liệu gửi đi',
    fileNotOwned: 'Không thể gắn file vì file chưa được tải lên hoặc không thuộc về bạn.',
    wrongSlot: 'Không thể gắn file vì loại file không đúng với ô đã chọn.',
    fileInUse: 'Không thể gắn file vì file này đã được dùng ở nơi khác.',
    inactiveCategory: 'Không thể lưu vì danh mục đã chọn không còn hoạt động.',
    pieceNotFound: 'Không thể tìm bài hát vì bài hát không tồn tại.',
    pieceNotPublic: 'Không thể mở bài hát vì bài hát không còn công khai.',
    sheetNotFound: 'Không thể tìm bản nhạc vì bản nhạc không tồn tại.',
    sheetNotPublic: 'Không thể mở bản nhạc vì bản nhạc không còn công khai.',
    noPublicSheet: 'Bài hát chưa có bản nhạc công khai nào; học sinh sẽ chưa thấy bản nhạc cho đến khi có bản công khai đầu tiên.',
    adminHiddenPiece: 'Không thể thay đổi hiển thị vì admin đã ẩn bài này, bạn không tự bật lại được.',
    adminHiddenSheet: 'Không thể thay đổi hiển thị vì admin đã ẩn bản nhạc này, bạn không tự bật lại được.',
    mainNeedsAudio: 'Không thể công khai bản nhạc vì bản chính cần bản thu mẫu trước khi công khai.',
    mainExists: 'Không thể tạo bản chính vì nhạc cụ này đã có bản chính.',
    duplicateSheetName: 'Tên bản này đã được sử dụng.',
    analysisSendFailed: 'Không gửi được yêu cầu phân tích tới dịch vụ AI.',
    uploadClosed: 'Không thể tải file lên vì file đã được xác nhận hoặc phiên tải lên đã hết hạn.'
  };

  static genre(name: string): string {
    return TestContext.catalog.genres[name];
  }

  static level(name: string): string {
    return TestContext.catalog.levels[name];
  }

  static instrument(code: 'DAN_TRANH' | 'DAN_BAU' | 'SAO_TRUC'): string {
    return TestContext.catalog.instruments[code];
  }

  static send(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, user?: TestUser, body?: unknown) {
    let pending = request(TestContext.app)[method](`${TestContext.api}${url}`);
    if (user) pending = pending.set(TestContext.auth(user));
    return body === undefined ? pending : pending.send(body as object);
  }

  static get(url: string, user?: TestUser) {
    return MusicLibraryFixture.send('get', url, user);
  }

  static post(url: string, body: unknown, user?: TestUser) {
    return MusicLibraryFixture.send('post', url, user, body);
  }

  static put(url: string, body: unknown, user?: TestUser) {
    return MusicLibraryFixture.send('put', url, user, body);
  }

  static patch(url: string, body: unknown, user?: TestUser) {
    return MusicLibraryFixture.send('patch', url, user, body);
  }

  static delete(url: string, user?: TestUser) {
    return MusicLibraryFixture.send('delete', url, user);
  }

  static fetchPublicUrl(publicUrl: string) {
    return request(TestContext.app).get(new URL(publicUrl).pathname);
  }

  static async confirm(user: TestUser, fileId: string) {
    const response = await MusicLibraryFixture.post(`/uploads/${fileId}/confirm`, {}, user);
    if (response.status !== 200) throw new Error(`confirm failed: ${JSON.stringify(response.body)}`);
    return response;
  }

  static async uploadFile(user: TestUser, kind: MusicLibrary.MediaKind, fileName: string, mimeType: string, content: Buffer, confirm: boolean = true) {
    const fileId = await TestContext.upload(user, kind, fileName, mimeType, content);
    if (confirm) await MusicLibraryFixture.confirm(user, fileId);
    return fileId;
  }

  static async pdf(user: TestUser, pageCount: number = 3, confirm: boolean = true) {
    const content = await SampleMediaFactory.createPdf('Sheet', pageCount);
    return MusicLibraryFixture.uploadFile(user, 'SHEET', 'ban-nhac.pdf', 'application/pdf', content, confirm);
  }

  static async wav(user: TestUser, durationSec: number = 6, confirm: boolean = true) {
    return MusicLibraryFixture.uploadFile(user, 'AUDIO', `ban-thu-${durationSec}s.wav`, 'audio/wav', SampleMediaFactory.createWav(durationSec), confirm);
  }

  static async png(user: TestUser, confirm: boolean = true) {
    return MusicLibraryFixture.uploadFile(user, 'COVER', 'bia.png', 'image/png', SampleMediaFactory.tinyPng, confirm);
  }

  static async video(user: TestUser, confirm: boolean = true) {
    return MusicLibraryFixture.uploadFile(user, 'VIDEO', 'huong-dan.mp4', 'video/mp4', MusicLibraryFixture.mp4(5), confirm);
  }

  // Smallest ISO-BMFF file that file-type detects as mp4 and music-metadata reads a duration from
  static mp4(durationSec: number): Buffer {
    const box = (type: string, ...parts: Buffer[]) => {
      const body = Buffer.concat(parts);
      const header = Buffer.alloc(8);
      header.writeUInt32BE(8 + body.length);
      header.write(type, 4, 'latin1');
      return Buffer.concat([header, body]);
    };
    const fileType = box('ftyp', Buffer.from('isom', 'latin1'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2mp41', 'latin1'));
    const movieHeader = Buffer.alloc(100);
    movieHeader.writeUInt32BE(1000, 12);
    movieHeader.writeUInt32BE(durationSec * 1000, 16);
    movieHeader.writeUInt32BE(0x00010000, 20);
    movieHeader.writeUInt16BE(0x0100, 24);
    movieHeader.writeUInt32BE(0x00010000, 36);
    movieHeader.writeUInt32BE(0x00010000, 52);
    movieHeader.writeUInt32BE(0x40000000, 68);
    movieHeader.writeUInt32BE(2, 96);
    return Buffer.concat([fileType, box('moov', box('mvhd', movieHeader))]);
  }

  static async presign(user: TestUser, body: Record<string, unknown>) {
    return MusicLibraryFixture.post('/uploads/presign', body, user);
  }

  static putContent(fileId: string, content: Buffer, user?: TestUser, mimeType: string = 'application/pdf') {
    let pending = request(TestContext.app).put(`${TestContext.api}/uploads/${fileId}/content`).set('Content-Type', mimeType);
    if (user) pending = pending.set(TestContext.auth(user));
    return pending.send(content);
  }

  static async createSheet(user: TestUser, pieceId: string, body: Record<string, unknown>) {
    return MusicLibraryFixture.post(`/lecturer/pieces/${pieceId}/sheet-music`, {
      instrumentId: MusicLibraryFixture.instrument('DAN_TRANH'),
      levelId: MusicLibraryFixture.level('Cơ bản'),
      ...body,
      sheetFileId: body.sheetFileId ?? await MusicLibraryFixture.pdf(user)
    }, user);
  }

  static async createSheetOrThrow(user: TestUser, pieceId: string, body: Record<string, unknown>) {
    const response = await MusicLibraryFixture.createSheet(user, pieceId, body);
    if (response.status !== 201) throw new Error(`create sheet failed: ${JSON.stringify(response.body)}`);
    return response.body.data as { id: string; name: string };
  }

  static async setPieceVisibility(user: TestUser, pieceId: string, visibility: 'PUBLIC' | 'HIDDEN') {
    return MusicLibraryFixture.patch(`/lecturer/pieces/${pieceId}/visibility`, { visibility }, user);
  }

  static async setConfig(key: string, value: string) {
    await TestContext.prisma.systemConfig.create({ data: { key, value, label: key, valueType: 'NUMBER', group: 'FILE_LIMIT' } });
  }

  static storagePath(storageKey: string): string {
    return path.join(MusicLibraryFixture.storageRoot, storageKey);
  }

  static storedFileExists(storageKey: string): boolean {
    return fs.existsSync(MusicLibraryFixture.storagePath(storageKey));
  }

  static titles(response: ApiResponse): string[] {
    return response.body.data.items.map((item: { title: string }) => item.title);
  }

  static pause(milliseconds: number = 15) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  static expectError(response: ApiResponse, status: number, expected: Record<string, unknown>) {
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ success: false, ...expected });
  }

  static expectValidationError(response: ApiResponse, field: string) {
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, field, message: MusicLibraryFixture.messages.invalidData });
    expect(response.body.code).toBeUndefined();
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  }

  static expectForbidden(response: ApiResponse) {
    MusicLibraryFixture.expectError(response, 403, { message: MusicLibraryFixture.messages.forbidden });
  }

  static expectUnauthorized(response: ApiResponse) {
    MusicLibraryFixture.expectError(response, 401, { message: MusicLibraryFixture.messages.unauthorized });
  }

  // Monday 00:00 of the current week in Vietnam time (UTC+7), as a UTC instant
  static vietnamWeekStart(): Date {
    const offsetMs = 7 * 60 * 60 * 1000;
    const vietnamNow = new Date(Date.now() + offsetMs);
    const daysSinceMonday = (vietnamNow.getUTCDay() + 6) % 7;
    const mondayVietnam = Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate() - daysSinceMonday);
    return new Date(mondayVietnam - offsetMs);
  }

  static vietnamWeekStartText(): string {
    return new Date(MusicLibraryFixture.vietnamWeekStart().getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
}
