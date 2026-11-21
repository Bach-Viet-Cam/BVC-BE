/* eslint-disable @typescript-eslint/no-explicit-any -- Express request / response are faked with plain objects */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import VerifiedContentService from '../service/VerifiedContentService.ts';
import { protectVerifiedAudio } from './VerifiedAudioMiddleware.ts';

const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const KEY = `audio/2026-11/${UUID}.wav`;
const NOT_FOUND = 'Không tìm thấy dữ liệu yêu cầu.';
const OPEN_VIA = 'Vui lòng mở bản thu qua học liệu hoặc bài nộp.';
const INVALID_PATH = 'Đường dẫn file không hợp lệ.';

async function runMiddleware(requestPath: string, isProtected = false) {
  const isProtectedMock = mock.method(VerifiedContentService, 'isProtectedKey', async () => isProtected);
  const headers: Record<string, string> = {};
  const response = { setHeader: (name: string, value: string) => { headers[name] = value; } } as any;
  const next = mock.fn();

  await protectVerifiedAudio({ path: requestPath } as any, response, next);

  return { isProtectedMock, headers, next, error: next.mock.calls[0]?.arguments[0] as any };
}

async function assertBlocked(requestPath: string, message = NOT_FOUND, statusCode = 404) {
  const { error, isProtectedMock } = await runMiddleware(requestPath);

  assert.equal(error?.statusCode, statusCode);
  assert.equal(error?.message, message);
  assert.equal(isProtectedMock.mock.callCount(), 0);
}

describe('VerifiedAudioMiddleware.protectVerifiedAudio', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('cho đi tiếp với key chuẩn không được bảo vệ và đặt Cache-Control private, no-store', async () => {
    const { next, headers, isProtectedMock } = await runMiddleware(`/${KEY}`);

    assert.deepEqual(next.mock.calls[0].arguments, []);
    assert.equal(headers['Cache-Control'], 'private, no-store');
    assert.equal(isProtectedMock.mock.callCount(), 1);
    assert.deepEqual(isProtectedMock.mock.calls[0].arguments, [KEY]);
  });

  it('báo lỗi 404 yêu cầu mở qua học liệu khi bản thu đã được xác minh (protected key)', async () => {
    const { error, headers } = await runMiddleware(`/${KEY}`, true);

    assert.equal(error.statusCode, 404);
    assert.equal(error.message, OPEN_VIA);
    assert.equal(headers['Cache-Control'], 'private, no-store');
  });

  describe('Giá trị biên (Boundary cases)', () => {
    it('chấp nhận key không có thư mục năm-tháng', async () => {
      const { next, isProtectedMock } = await runMiddleware(`/audio/${UUID}.mp3`);

      assert.deepEqual(next.mock.calls[0].arguments, []);
      assert.deepEqual(isProtectedMock.mock.calls[0].arguments, [`audio/${UUID}.mp3`]);
    });

    it('chuyển key viết hoa về chữ thường trước khi kiểm tra', async () => {
      const { next, isProtectedMock } = await runMiddleware(`/AUDIO/2026-11/${UUID.toUpperCase()}.WAV`);

      assert.deepEqual(next.mock.calls[0].arguments, []);
      assert.deepEqual(isProtectedMock.mock.calls[0].arguments, [KEY]);
    });

    it('chuẩn hóa dấu gạch ngược thành "/" rồi kiểm tra như key chuẩn', async () => {
      const { next, isProtectedMock } = await runMiddleware(`/audio\\2026-11\\${UUID}.wav`);

      assert.deepEqual(next.mock.calls[0].arguments, []);
      assert.deepEqual(isProtectedMock.mock.calls[0].arguments, [KEY]);
    });
  });

  it('bỏ qua file không phải audio: không đặt header và không kiểm tra key', async () => {
    const { next, headers, isProtectedMock } = await runMiddleware('/sheet/2026-11/f1.pdf');

    assert.deepEqual(next.mock.calls[0].arguments, []);
    assert.deepEqual(headers, {});
    assert.equal(isProtectedMock.mock.callCount(), 0);
  });

  describe('Đường dẫn không hợp lệ bị chặn 404', () => {
    it('phần mở rộng không được phép (.ogg)', async () => {
      await assertBlocked(`/audio/2026-11/${UUID}.ogg`);
    });

    it('tên file không phải UUID', async () => {
      await assertBlocked('/audio/2026-11/secret.wav');
    });

    it('đường dẫn có path traversal (../)', async () => {
      await assertBlocked(`/audio/2026-11/../../${UUID}.wav`);
    });

    it('Windows alternate data stream (:stream)', async () => {
      await assertBlocked(`/${KEY}:stream`);
    });

    it('dấu chấm ở cuối tên file', async () => {
      await assertBlocked(`/${KEY}.`);
    });

    it('ký tự NUL (%00)', async () => {
      await assertBlocked(`/${KEY}%00`);
    });
  });

  it('báo lỗi 400 khi percent-encoding sai định dạng', async () => {
    await assertBlocked('/audio/%E0%A4%A', INVALID_PATH, 400);
  });

  it('không nuốt lỗi khi kiểm tra key thất bại (DB down) và KHÔNG gọi next()', async () => {
    mock.method(VerifiedContentService, 'isProtectedKey', async () => {
      throw new Error('DB down');
    });
    const next = mock.fn();

    await assert.rejects(
      protectVerifiedAudio({ path: `/${KEY}` } as any, { setHeader: () => undefined } as any, next),
      /DB down/
    );
    assert.equal(next.mock.callCount(), 0);
  });
});
