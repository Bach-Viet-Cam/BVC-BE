/* eslint-disable @typescript-eslint/no-explicit-any -- zod results are inspected loosely */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ZodFieldRule from '../../../utils/ZodFieldRule.ts';
import MusicLibraryValidation from './MusicLibraryValidation.ts';

const schemas = MusicLibraryValidation as any;

function parseValid(schema: any, value: unknown): any {
  const result = schema.safeParse(value);
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  return result.data;
}

function getFirstIssue(schema: any, value: unknown): any {
  const result = schema.safeParse(value);
  assert.equal(result.success, false);
  return result.error.issues[0];
}

function assertMessageIssue(schema: any, value: unknown, code: string, message: string, issuePath?: string): void {
  const issue = getFirstIssue(schema, value);
  assert.equal(issue.params?.code, code);
  assert.equal(issue.message, message);
  if (issuePath) assert.equal(issue.path.join('.'), issuePath);
}

function createRequest(body: unknown, params: unknown = {}, query: unknown = {}) {
  return { body, params, query };
}

describe('MusicLibraryValidation', () => {
  describe('ZodFieldRule.requiredText', () => {
    const titleSchema = () => ZodFieldRule.requiredText('Tiêu đề', 200);

    it('cắt khoảng trắng hai đầu', () => {
      assert.equal(parseValid(titleSchema(), '  Lý ngựa ô  '), 'Lý ngựa ô');
    });

    it('báo lỗi MSG-35 khi để trống', () => {
      assertMessageIssue(titleSchema(), '', 'MSG-35', 'Tiêu đề không được để trống.');
    });

    it('giá trị biên: chấp nhận đúng 200 ký tự', () => {
      assert.equal(parseValid(titleSchema(), 'a'.repeat(200)).length, 200);
    });

    it('giá trị biên: báo lỗi MSG-37 khi dài 201 ký tự', () => {
      assertMessageIssue(titleSchema(), 'a'.repeat(201), 'MSG-37', 'Tiêu đề không được vượt quá 200 ký tự.');
    });
  });

  describe('ZodFieldRule.optionalText', () => {
    const descriptionSchema = () => ZodFieldRule.optionalText('Mô tả', 1000);

    it('giữ nguyên undefined', () => {
      assert.equal(parseValid(descriptionSchema(), undefined), undefined);
    });

    it('chuỗi chỉ có khoảng trắng được lưu là null', () => {
      assert.equal(parseValid(descriptionSchema(), '   '), null);
    });

    it('giá trị biên: báo lỗi MSG-37 khi dài 1001 ký tự', () => {
      assertMessageIssue(descriptionSchema(), 'a'.repeat(1001), 'MSG-37', 'Mô tả không được vượt quá 1000 ký tự.');
    });
  });

  describe('ZodFieldRule.requiredId / requiredIdList / queryIdList', () => {
    it('cắt khoảng trắng của id', () => {
      assert.equal(parseValid(ZodFieldRule.requiredId('Thể loại'), ' g-nambo '), 'g-nambo');
    });

    it('báo lỗi MSG-35 khi id rỗng', () => {
      assertMessageIssue(ZodFieldRule.requiredId('Thể loại'), '', 'MSG-35', 'Thể loại không được để trống.');
    });

    it('cắt khoảng trắng và loại bỏ id trùng trong danh sách', () => {
      assert.deepEqual(parseValid(ZodFieldRule.requiredIdList('Nhạc cụ'), ['a', ' a ', 'b']), ['a', 'b']);
    });

    it('giá trị biên: báo lỗi MSG-35 khi danh sách rỗng', () => {
      assertMessageIssue(ZodFieldRule.requiredIdList('Nhạc cụ'), [], 'MSG-35', 'Nhạc cụ không được để trống.');
    });

    it('giá trị biên: query không có danh sách id thì trả về []', () => {
      assert.deepEqual(parseValid(ZodFieldRule.queryIdList(), undefined), []);
    });
  });

  describe('ZodFieldRule.page / pageSize', () => {
    it('ép kiểu page từ chuỗi sang số', () => {
      assert.equal(parseValid(ZodFieldRule.page(), '2'), 2);
    });

    it('pageSize mặc định là 12', () => {
      assert.equal(parseValid(ZodFieldRule.pageSize(12, 100), undefined), 12);
    });

    it('giá trị biên: từ chối pageSize = 101', () => {
      assert.equal(ZodFieldRule.pageSize(12, 100).safeParse('101').success, false);
    });
  });

  describe('presignSchema', () => {
    const presignRequest = (body: Record<string, unknown>) =>
      createRequest({ kind: 'SHEET', fileName: 'ban-nhac.pdf', mimeType: 'application/pdf', size: 1000, ...body });

    it('ép kiểu size từ chuỗi sang số', () => {
      assert.equal(parseValid(schemas.presignSchema, presignRequest({ size: '1000' })).body.size, 1000);
    });

    it('từ chối kind không hợp lệ (DOC)', () => {
      assert.equal(getFirstIssue(schemas.presignSchema, presignRequest({ kind: 'DOC' })).path.join('.'), 'body.kind');
    });

    it('giá trị biên: từ chối size = 0', () => {
      assert.equal(getFirstIssue(schemas.presignSchema, presignRequest({ size: 0 })).path.join('.'), 'body.size');
    });
  });

  describe('createPieceSchema', () => {
    it('báo lỗi MSG-35 khi thiếu thể loại', () => {
      assertMessageIssue(schemas.createPieceSchema, createRequest({ title: 'Lý ngựa ô' }), 'MSG-35', 'Thể loại không được để trống.', 'body.genreId');
    });

    it('từ chối visibility không hợp lệ (PRIVATE)', () => {
      const request = createRequest({ title: 'Lý ngựa ô', genreId: 'g-nambo', visibility: 'PRIVATE' });

      assert.equal(getFirstIssue(schemas.createPieceSchema, request).path.join('.'), 'body.visibility');
    });
  });

  describe('createSheetMusicSchema / updateSheetMusicSchema', () => {
    const sheetRequest = (body: Record<string, unknown>) =>
      createRequest({ instrumentId: 'i-tranh', name: 'Bản chính', levelId: 'l-coban', sheetFileId: 'f1', ...body }, { id: 'p1' });

    it('báo lỗi MSG-35 khi thiếu file bản nhạc', () => {
      assertMessageIssue(schemas.createSheetMusicSchema, sheetRequest({ sheetFileId: undefined }), 'MSG-35', 'File bản nhạc không được để trống.', 'body.sheetFileId');
    });

    it('giá trị biên: báo lỗi MSG-37 khi tên bản dài 101 ký tự', () => {
      assertMessageIssue(schemas.createSheetMusicSchema, sheetRequest({ name: 'a'.repeat(101) }), 'MSG-37', 'Tên bản không được vượt quá 100 ký tự.', 'body.name');
    });

    it('từ chối kind không hợp lệ (EXTRA)', () => {
      assert.equal(getFirstIssue(schemas.createSheetMusicSchema, sheetRequest({ kind: 'EXTRA' })).path.join('.'), 'body.kind');
    });

    it('cập nhật: báo lỗi MSG-35 khi tên bản chỉ có khoảng trắng', () => {
      assertMessageIssue(schemas.updateSheetMusicSchema, createRequest({ name: '   ' }, { id: 's1' }), 'MSG-35', 'Tên bản không được để trống.', 'body.name');
    });
  });

  describe('lecturerPieceListSchema', () => {
    it('áp dụng giá trị mặc định khi query rỗng', () => {
      const query = parseValid(schemas.lecturerPieceListSchema, createRequest(undefined, {}, {})).query;

      assert.equal(query.visibility, 'ALL');
      assert.equal(query.page, 1);
      assert.equal(query.pageSize, 20);
    });

    it('từ chối visibility không hợp lệ (DELETED)', () => {
      const request = createRequest(undefined, {}, { visibility: 'DELETED' });

      assert.equal(getFirstIssue(schemas.lecturerPieceListSchema, request).path.join('.'), 'query.visibility');
    });
  });

  describe('libraryPieceListSchema', () => {
    it('đọc danh sách id dạng genreIds[] và chuỗi đơn, áp dụng giá trị mặc định', () => {
      const query = parseValid(schemas.libraryPieceListSchema, createRequest(undefined, {}, { 'genreIds[]': ['g1', 'g2'], levelIds: 'l1' })).query;

      assert.deepEqual(query.genreIds, ['g1', 'g2']);
      assert.deepEqual(query.instrumentIds, []);
      assert.deepEqual(query.levelIds, ['l1']);
      assert.equal(query.sort, 'newest');
      assert.equal(query.page, 1);
      assert.equal(query.pageSize, 12);
    });

    it('gộp cả hai kiểu key genreIds và genreIds[]', () => {
      const query = parseValid(schemas.libraryPieceListSchema, createRequest(undefined, {}, { genreIds: 'g1', 'genreIds[]': 'g2' })).query;

      assert.deepEqual(query.genreIds, ['g1', 'g2']);
    });

    it('từ chối sort không hợp lệ (popular)', () => {
      const request = createRequest(undefined, {}, { sort: 'popular' });

      assert.equal(getFirstIssue(schemas.libraryPieceListSchema, request).path.join('.'), 'query.sort');
    });
  });

  describe('savedListSchema / sheetMusicFileSchema / visibilitySchema', () => {
    it('savedListSchema áp dụng giá trị mặc định', () => {
      assert.deepEqual(parseValid(schemas.savedListSchema, createRequest(undefined, {}, {})).query, { type: 'PIECE', page: 1, pageSize: 20 });
    });

    it('sheetMusicFileSchema đọc slot và fileId', () => {
      assert.equal(parseValid(schemas.sheetMusicFileSchema, createRequest({ fileId: 'a2' }, { id: 's1', slot: 'audio' })).params.slot, 'audio');
    });

    it('visibilitySchema báo lỗi khi thiếu visibility', () => {
      assert.equal(getFirstIssue(schemas.visibilitySchema, createRequest({}, { id: 'p1' })).path.join('.'), 'body.visibility');
    });
  });
});
