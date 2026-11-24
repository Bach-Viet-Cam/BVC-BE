import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AppError from '../../../utils/AppError.ts';
import RhythmClientService from './RhythmClientService.ts';

const GET_MSG = 'Chưa thể lấy kết quả phân tích. Vui lòng thử kiểm tra lại.';
const ANALYSIS_MSG = 'Chưa thể lấy dữ liệu cao độ từ dịch vụ phân tích.';
const RETRY_MSG = 'Chưa thể gửi yêu cầu xử lý lại. Vui lòng thử lại sau.';
const KEY_MSG = 'Chưa cấu hình kết nối dịch vụ phân tích.';
const result = { overallScore: 80, pitchAccuracyPercent: 75, rhythmAccuracyPercent: 90, aiFeedback: 'Cần luyện thêm cao độ.' };
const MAX = 5 * 1024 * 1024;
const err = (status: number, message: string) => (e: unknown) => e instanceof AppError && e.statusCode === status && e.message === message;
const mk = (request: typeof fetch, key = 'secret', base = 'http://rhythm:8001') => new RhythmClientService(request, key, base);
const fixed = (response: () => Response): typeof fetch => async () => response();
const reject: typeof fetch = async () => { throw new Error('network'); };
const noCall = (): { request: typeof fetch; count: () => number } => { let n = 0; return { request: (async () => { n += 1; return new Response(null); }) as typeof fetch, count: () => n }; };

describe('RhythmClientService.get (UTC-AD)', () => {
  it('UTC-AD-028 returns parsed completed evaluation, GET with Bearer key', async () => {
    let seen: { url?: unknown; init?: RequestInit } = {};
    const request: typeof fetch = async (url, init) => { seen = { url, init }; return Response.json({ evaluationId: 'ev-1', status: 'completed', result, error: null }); };
    const parsed = await mk(request).get('ev-1');
    assert.equal(parsed?.status, 'completed'); assert.deepEqual(parsed?.result, result);
    assert.equal(seen.url, 'http://rhythm:8001/api/v1/evaluations/ev-1');
    assert.equal((seen.init?.headers as Record<string, string>).Authorization, 'Bearer secret');
  });
  it('UTC-AD-029 returns null on 404', async () => { assert.equal(await mk(fixed(() => new Response(null, { status: 404 }))).get('ev-1'), null); });
  it('UTC-AD-030 503 on HTTP 500 and 401', async () => {
    for (const status of [500, 401]) await assert.rejects(mk(fixed(() => new Response(null, { status }))).get('ev-1'), err(503, GET_MSG));
  });
  it('UTC-AD-031 503 when response carries another evaluationId', async () => {
    await assert.rejects(mk(fixed(() => Response.json({ evaluationId: 'other', status: 'completed', result, error: null }))).get('ev-1'), err(503, GET_MSG));
  });
  it('UTC-AD-032 503 when completed has result null', async () => {
    await assert.rejects(mk(fixed(() => Response.json({ evaluationId: 'ev-1', status: 'completed', result: null, error: null }))).get('ev-1'), err(503, GET_MSG));
  });
  it('UTC-AD-033 503 when failed has error null', async () => {
    await assert.rejects(mk(fixed(() => Response.json({ evaluationId: 'ev-1', status: 'failed', result: null, error: null }))).get('ev-1'), err(503, GET_MSG));
  });
  it('UTC-AD-034 503 when API key is empty and fetch is not called', async () => {
    const spy = noCall();
    await assert.rejects(mk(spy.request, '').get('ev-1'), err(503, KEY_MSG));
    assert.equal(spy.count(), 0);
  });
  it('UTC-AD-035 URL-encodes the evaluation id', async () => {
    let url = '';
    await mk((async (u: unknown) => { url = String(u); return new Response(null, { status: 404 }); }) as typeof fetch).get('a/b?c');
    assert.equal(url, 'http://rhythm:8001/api/v1/evaluations/a%2Fb%3Fc');
  });
  // New cases
  it('UTC-AD-080 503 when fetch rejects (network error)', async () => { await assert.rejects(mk(reject).get('ev-1'), err(503, GET_MSG)); });
  it('UTC-AD-081 503 when body is not valid JSON', async () => { await assert.rejects(mk(fixed(() => new Response('not json', { status: 200 }))).get('ev-1'), err(503, GET_MSG)); });
  it('UTC-AD-082 returns failed evaluation with error object', async () => {
    const error = { code: 'AUDIO_QUALITY', message: 'Audio quá nhiễu' };
    const parsed = await mk(fixed(() => Response.json({ evaluationId: 'ev-1', status: 'failed', result: null, error }))).get('ev-1');
    assert.equal(parsed?.status, 'failed'); assert.deepEqual(parsed?.error, error);
  });
  it('UTC-AD-083 503 when status value is unknown', async () => {
    await assert.rejects(mk(fixed(() => Response.json({ evaluationId: 'ev-1', status: 'weird', result: null, error: null }))).get('ev-1'), err(503, GET_MSG));
  });
  it('UTC-AD-084 boundary: score 100 accepted, 101 rejected', async () => {
    const body = (score: number) => Response.json({ evaluationId: 'ev-1', status: 'completed', result: { ...result, overallScore: score }, error: null });
    assert.equal((await mk(fixed(() => body(100))).get('ev-1'))?.result?.overallScore, 100);
    await assert.rejects(mk(fixed(() => body(101))).get('ev-1'), err(503, GET_MSG));
  });
  it('UTC-AD-085 keeps extra analysis fields inside result', async () => {
    const parsed = await mk(fixed(() => Response.json({ evaluationId: 'ev-1', status: 'completed', result: { ...result, segments: [1, 2] }, error: null }))).get('ev-1');
    assert.deepEqual((parsed?.result as Record<string, unknown>).segments, [1, 2]);
  });
});

describe('RhythmClientService.getAnalysis (UTC-AD)', () => {
  const analysis = { schemaVersion: 1, pitch: { teacher: [1], student: [2] } };
  it('UTC-AD-036 returns parsed JSON and calls /analysis', async () => {
    let url = '';
    const out = await mk((async (u: unknown) => { url = String(u); return Response.json(analysis); }) as typeof fetch).getAnalysis('ev-1');
    assert.deepEqual(out, analysis); assert.equal(url, 'http://rhythm:8001/api/v1/evaluations/ev-1/analysis');
  });
  it('UTC-AD-037 returns null on 404 and 409', async () => {
    for (const status of [404, 409]) assert.equal(await mk(fixed(() => new Response(null, { status }))).getAnalysis('ev-1'), null);
  });
  it('UTC-AD-038 503 on HTTP 500', async () => { await assert.rejects(mk(fixed(() => new Response(null, { status: 500 }))).getAnalysis('ev-1'), err(503, ANALYSIS_MSG)); });
  it('UTC-AD-039 503 when fetch rejects', async () => { await assert.rejects(mk(reject).getAnalysis('ev-1'), err(503, ANALYSIS_MSG)); });
  it('UTC-AD-040 503 when content-length is 5 MiB + 1', async () => {
    await assert.rejects(mk(fixed(() => new Response('{}', { headers: { 'content-length': String(MAX + 1) } }))).getAnalysis('ev-1'), err(503, 'File phân tích cao độ quá lớn.'));
  });
  it('UTC-AD-041 503 when body is not JSON', async () => {
    await assert.rejects(mk(fixed(() => new Response('not json'))).getAnalysis('ev-1'), err(503, 'File phân tích cao độ không hợp lệ.'));
  });
  // New cases
  it('UTC-AD-086 accepts content-length exactly 5 MiB', async () => {
    assert.deepEqual(await mk(fixed(() => new Response('{"a":1}', { headers: { 'content-length': String(MAX) } }))).getAnalysis('ev-1'), { a: 1 });
  });
  it('UTC-AD-087 503 when actual body exceeds 5 MiB without content-length', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(MAX) });
    await assert.rejects(mk(fixed(() => new Response(big))).getAnalysis('ev-1'), err(503, 'File phân tích cao độ quá lớn.'));
  });
  it('UTC-AD-088 503 when API key empty and fetch not called', async () => {
    const spy = noCall();
    await assert.rejects(mk(spy.request, '').getAnalysis('ev-1'), err(503, KEY_MSG)); assert.equal(spy.count(), 0);
  });
  it('UTC-AD-089 sends Bearer key and URL-encodes the id', async () => {
    let url = ''; let auth = '';
    await mk((async (u: unknown, init?: RequestInit) => { url = String(u); auth = (init?.headers as Record<string, string>).Authorization; return new Response(null, { status: 404 }); }) as typeof fetch).getAnalysis('a/b');
    assert.equal(url, 'http://rhythm:8001/api/v1/evaluations/a%2Fb/analysis'); assert.equal(auth, 'Bearer secret');
  });
});

describe('RhythmClientService.retry (UTC-AD)', () => {
  it('UTC-AD-042 returns true on 202 and POSTs fromJob/attempt', async () => {
    let init: RequestInit | undefined; let url = '';
    const ok = await mk((async (u: unknown, i?: RequestInit) => { url = String(u); init = i; return Response.json({}, { status: 202 }); }) as typeof fetch).retry('ev-1', 'feedback', 2);
    assert.equal(ok, true); assert.equal(url, 'http://rhythm:8001/api/v1/evaluations/ev-1/retry');
    assert.equal(init?.method, 'POST'); assert.deepEqual(JSON.parse(String(init?.body)), { fromJob: 'feedback', attempt: 2 });
  });
  it('UTC-AD-043 returns false on 404', async () => { assert.equal(await mk(fixed(() => new Response(null, { status: 404 }))).retry('ev-1', 'feedback', 2), false); });
  it('UTC-AD-044 503 on 409', async () => { await assert.rejects(mk(fixed(() => new Response(null, { status: 409 }))).retry('ev-1', 'feedback', 2), err(503, RETRY_MSG)); });
  // New cases
  it('UTC-AD-090 503 when fetch rejects', async () => { await assert.rejects(mk(reject).retry('ev-1', 'feedback', 2), err(503, RETRY_MSG)); });
  it('UTC-AD-091 503 when API key empty and fetch not called', async () => {
    const spy = noCall();
    await assert.rejects(mk(spy.request, '').retry('ev-1', 'feedback', 2), err(503, KEY_MSG)); assert.equal(spy.count(), 0);
  });
  it('UTC-AD-092 sends Bearer key and JSON content type', async () => {
    let headers: Record<string, string> = {};
    await mk((async (_u: unknown, i?: RequestInit) => { headers = i?.headers as Record<string, string>; return new Response(null, { status: 202 }); }) as typeof fetch).retry('ev-1', 'feedback', 1);
    assert.equal(headers.Authorization, 'Bearer secret'); assert.equal(headers['Content-Type'], 'application/json');
  });
  it('UTC-AD-093 returns true for any 2xx (200) and 503 on 500', async () => {
    assert.equal(await mk(fixed(() => new Response(null, { status: 200 }))).retry('ev-1', 'feedback', 1), true);
    await assert.rejects(mk(fixed(() => new Response(null, { status: 500 }))).retry('ev-1', 'feedback', 1), err(503, RETRY_MSG));
  });
});
