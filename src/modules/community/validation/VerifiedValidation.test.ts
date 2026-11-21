/* eslint-disable @typescript-eslint/no-explicit-any -- zod results are inspected loosely */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import VerifiedValidation from './VerifiedValidation.ts';

const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const schemas = VerifiedValidation as any;

function getIssuePaths(result: any): string[] {
  return result.error.issues.map((issue: any) => issue.path.join('.'));
}

function assertRejectedOn(result: any, field: string): void {
  assert.equal(result.success, false);
  assert.ok(getIssuePaths(result).includes(field), `expected an issue on "${field}", got ${getIssuePaths(result)}`);
}

function parseRequest(schema: any, body: unknown, params: unknown, query: unknown = {}): any {
  return schema.safeParse({ body, params, query });
}

describe('VerifiedValidation', () => {
  describe('query', () => {
    it('áp dụng giá trị mặc định khi query rỗng', () => {
      const result = schemas.query.safeParse({});

      assert.equal(result.success, true);
      assert.deepEqual(result.data, { q: '', status: 'VISIBLE', sortBy: 'verifiedAt', sortDir: 'desc', page: 1, pageSize: 20 });
    });

    it('giá trị biên: từ chối q dài 201 ký tự', () => {
      assertRejectedOn(schemas.query.safeParse({ q: 'a'.repeat(201) }), 'q');
    });

    it('giá trị biên: từ chối cohort dài 51 ký tự', () => {
      assertRejectedOn(schemas.query.safeParse({ cohort: 'k'.repeat(51) }), 'cohort');
    });

    it('giá trị biên: từ chối instrumentId dài 65 ký tự', () => {
      assertRejectedOn(schemas.query.safeParse({ instrumentId: 'i'.repeat(65) }), 'instrumentId');
    });

    it('từ chối status không nằm trong enum (ARCHIVED)', () => {
      assertRejectedOn(schemas.query.safeParse({ status: 'ARCHIVED' }), 'status');
    });

    it('giá trị biên: từ chối sortDir viết hoa (ASC)', () => {
      assertRejectedOn(schemas.query.safeParse({ sortDir: 'ASC' }), 'sortDir');
    });

    it('giá trị biên: từ chối page = 0', () => {
      assertRejectedOn(schemas.query.safeParse({ page: '0' }), 'page');
    });

    it('từ chối page không phải số', () => {
      assertRejectedOn(schemas.query.safeParse({ page: 'abc' }), 'page');
    });

    it('giá trị biên: từ chối pageSize = 101', () => {
      assertRejectedOn(schemas.query.safeParse({ pageSize: '101' }), 'pageSize');
    });
  });

  describe('reviewBody', () => {
    it('chấp nhận APPROVE và manual mặc định là false', () => {
      const result = schemas.reviewBody.safeParse({ decision: 'APPROVE' });

      assert.equal(result.success, true);
      assert.equal(result.data.manual, false);
    });

    it('chấp nhận REJECT có lý do', () => {
      assert.equal(schemas.reviewBody.safeParse({ decision: 'REJECT', reason: 'Thu âm bị rè' }).success, true);
    });

    it('từ chối REJECT thiếu lý do với thông báo "Vui lòng nhập lý do từ chối."', () => {
      const result = schemas.reviewBody.safeParse({ decision: 'REJECT' });

      assertRejectedOn(result, 'reason');
      assert.equal(result.error.issues[0].message, 'Vui lòng nhập lý do từ chối.');
    });

    it('giá trị biên: từ chối lý do chỉ có khoảng trắng', () => {
      assertRejectedOn(schemas.reviewBody.safeParse({ decision: 'REJECT', reason: '   ' }), 'reason');
    });

    it('giá trị biên: từ chối lý do dài 2001 ký tự', () => {
      assertRejectedOn(schemas.reviewBody.safeParse({ decision: 'REJECT', reason: 'r'.repeat(2001) }), 'reason');
    });

    it('từ chối decision không hợp lệ (DELETE)', () => {
      assertRejectedOn(schemas.reviewBody.safeParse({ decision: 'DELETE' }), 'decision');
    });

    it('từ chối key lạ trong body', () => {
      assert.equal(schemas.reviewBody.safeParse({ decision: 'APPROVE', extra: 1 }).success, false);
    });
  });

  describe('mutationBody', () => {
    it('chấp nhận status HIDDEN kèm version', () => {
      assert.equal(schemas.mutationBody.safeParse({ status: 'HIDDEN', version: 1 }).success, true);
    });

    it('từ chối khi thiếu version', () => {
      assertRejectedOn(schemas.mutationBody.safeParse({ status: 'HIDDEN' }), 'version');
    });

    it('giá trị biên: từ chối version = 0', () => {
      assertRejectedOn(schemas.mutationBody.safeParse({ version: 0 }), 'version');
    });

    it('từ chối status REVOKED (thu hồi dùng endpoint riêng)', () => {
      assertRejectedOn(schemas.mutationBody.safeParse({ status: 'REVOKED', version: 1 }), 'status');
    });

    it('từ chối key lạ trong body', () => {
      assert.equal(schemas.mutationBody.safeParse({ version: 1, owner: 'x' }).success, false);
    });
  });

  describe('id / consent / list / library', () => {
    it('id: từ chối params.id không phải UUID', () => {
      assert.equal(parseRequest(schemas.id, undefined, { id: '123' }).success, false);
    });

    it('consent: từ chối isGranted không phải boolean', () => {
      assert.equal(parseRequest(schemas.consent, { isGranted: 'yes' }, { id: UUID }).success, false);
    });

    it('list: ép kiểu query.page từ chuỗi sang số', () => {
      assert.equal(parseRequest(schemas.list, undefined, {}, { page: '2' }).data.query.page, 2);
    });

    it('list: giá trị biên: từ chối pageSize = 500', () => {
      assert.equal(parseRequest(schemas.list, undefined, {}, { pageSize: '500' }).success, false);
    });

    it('library: từ chối khi thiếu instrumentId', () => {
      assert.equal(parseRequest(schemas.library, undefined, { id: 'piece-1' }, {}).success, false);
    });
  });
});
