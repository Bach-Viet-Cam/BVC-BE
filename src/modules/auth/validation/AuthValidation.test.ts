/* eslint-disable @typescript-eslint/no-explicit-any -- zod results are inspected loosely */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import AuthValidation from './AuthValidation.ts';

function parseGoogleAuth(body: unknown, extra: Record<string, unknown> = {}): any {
  return (AuthValidation.googleAuthSchema as any).safeParse({ body, params: {}, query: {}, ...extra });
}

function getIssuePaths(result: any): string[] {
  return result.error.issues.map((issue: any) => issue.path.join('.'));
}

describe('AuthValidation', () => {
  describe('googleAuthSchema', () => {
    it('chấp nhận credential hợp lệ', () => {
      const result = parseGoogleAuth({ credential: 'id-token' });

      assert.equal(result.success, true);
      assert.deepEqual(result.data.body, { credential: 'id-token' });
    });

    it('giá trị biên: cắt khoảng trắng hai đầu credential', () => {
      const result = parseGoogleAuth({ credential: '  id-token  ' });

      assert.equal(result.data.body.credential, 'id-token');
    });

    it('giá trị biên: từ chối credential rỗng', () => {
      const result = parseGoogleAuth({ credential: '' });

      assert.equal(result.success, false);
      assert.deepEqual(getIssuePaths(result), ['body.credential']);
    });

    it('giá trị biên: từ chối credential chỉ có khoảng trắng', () => {
      assert.equal(parseGoogleAuth({ credential: '   ' }).success, false);
    });

    it('từ chối body thiếu credential', () => {
      const result = parseGoogleAuth({});

      assert.equal(result.success, false);
      assert.deepEqual(getIssuePaths(result), ['body.credential']);
    });

    it('chấp nhận createIfMissing = true', () => {
      const result = parseGoogleAuth({ credential: 't', createIfMissing: true });

      assert.equal(result.data.body.createIfMissing, true);
    });

    it('từ chối createIfMissing là chuỗi "true" thay vì boolean', () => {
      const result = parseGoogleAuth({ credential: 't', createIfMissing: 'true' });

      assert.equal(result.success, false);
      assert.deepEqual(getIssuePaths(result), ['body.createIfMissing']);
    });

    it('từ chối createIfMissing là số', () => {
      assert.equal(parseGoogleAuth({ credential: 't', createIfMissing: 1 }).success, false);
    });

    it('giá trị biên: query và params không bị kiểm tra chặt', () => {
      const result = parseGoogleAuth({ credential: 't' }, { query: { a: '1' }, params: { id: 'x' } });

      assert.equal(result.success, true);
    });
  });

  describe('refreshSchema / logoutSchema', () => {
    it('chấp nhận body rỗng', () => {
      const result = (AuthValidation.refreshSchema as any).safeParse({ body: {}, params: {}, query: {} });

      assert.equal(result.success, true);
      assert.deepEqual(result.data.body, {});
    });

    it('giá trị biên: body mặc định là {} khi request không có JSON body', () => {
      const result = (AuthValidation.refreshSchema as any).safeParse({ params: {}, query: {} });

      assert.equal(result.success, true);
      assert.deepEqual(result.data.body, {});
    });

    it('logoutSchema dùng chung schema với refreshSchema', () => {
      assert.equal(AuthValidation.logoutSchema, AuthValidation.refreshSchema);
    });
  });
});
