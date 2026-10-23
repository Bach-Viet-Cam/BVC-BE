import { test } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import RhythmClientService from './RhythmClientService.ts';

test('Rhythm client giữ key ở server và phân biệt queued 404, completed, lỗi tạm thời', async () => {
  const result = { overallScore: 80, pitchAccuracyPercent: 75, rhythmAccuracyPercent: 90, aiFeedback: 'Cần luyện thêm cao độ.' };
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'http://rhythm:8001/api/v1/evaluations/eval-1');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer secret');
    return Response.json({ evaluationId: 'eval-1', status: 'completed', result, error: null });
  };
  assert.deepEqual((await new RhythmClientService(request, 'secret', 'http://rhythm:8001').get('eval-1'))?.result, result);
  assert.equal(await new RhythmClientService(async () => new Response(null, { status: 404 }), 'secret').get('eval-1'), null);
  for (const status of [401, 403, 500]) {
    await assert.rejects(new RhythmClientService(async () => new Response(null, { status }), 'secret').get('eval-1'), (error) => error instanceof AppError && error.statusCode === 503);
  }
  await assert.rejects(new RhythmClientService(async () => Response.json({ evaluationId: 'other', status: 'completed', result, error: null }), 'secret').get('eval-1'));
  await assert.rejects(new RhythmClientService(async () => Response.json({ evaluationId: 'eval-1', status: 'completed', result: null, error: null }), 'secret').get('eval-1'));
});

test('Rhythm client gửi yêu cầu xử lý lại từ bước lỗi và phân biệt 404 với lỗi khác', async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'http://rhythm:8001/api/v1/evaluations/eval-1/retry');
    assert.equal(options?.method, 'POST');
    assert.deepEqual(JSON.parse(String(options?.body)), { fromJob: 'feedback', attempt: 2 });
    return Response.json({}, { status: 202 });
  };
  assert.equal(await new RhythmClientService(request, 'secret', 'http://rhythm:8001').retry('eval-1', 'feedback', 2), true);
  assert.equal(await new RhythmClientService(async () => new Response(null, { status: 404 }), 'secret').retry('eval-1', 'feedback', 2), false);
  await assert.rejects(new RhythmClientService(async () => new Response(null, { status: 409 }), 'secret').retry('eval-1', 'feedback', 2), (error) => error instanceof AppError && error.statusCode === 503);
});
