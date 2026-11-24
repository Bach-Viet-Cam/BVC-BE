import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AudioPitchTrimService from './AudioPitchTrimService.ts';

const sampleRate = 16000;
interface Part { kind: 'silence' | 'noise' | 'tone'; seconds: number; amplitude?: number; }

function buildWav(parts: Part[]): Buffer {
  const total = parts.reduce((s, p) => s + Math.round(p.seconds * sampleRate), 0);
  const pcm = Buffer.alloc(total * 2);
  let seed = 12345; let position = 0;
  for (const part of parts) {
    const length = Math.round(part.seconds * sampleRate);
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const a = part.amplitude ?? 16000;
      const v = part.kind === 'tone' ? Math.sin((2 * Math.PI * 440 * (position + i)) / sampleRate) * a
        : part.kind === 'noise' ? (seed / 2147483648 - 0.5) * a : 0;
      pcm.writeInt16LE(Math.round(v), (position + i) * 2);
    }
    position += length;
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36, 'ascii'); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const duration = (wav: Buffer): number => wav.readUInt32LE(wav.indexOf('data', 12, 'ascii') + 4) / (sampleRate * 2);
const sil = (s: number): Part => ({ kind: 'silence', seconds: s });
const tone = (s: number): Part => ({ kind: 'tone', seconds: s });
const noise = (s: number): Part => ({ kind: 'noise', seconds: s });

async function withDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bvc-utc-trim-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('AudioPitchTrimService (UTC-AD)', () => {
  afterEach(() => mock.restoreAll());
  const svc = () => new AudioPitchTrimService();

  it('UTC-AD-107 trimFile "both" removes leading and trailing silence around a tone', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); await writeFile(f, buildWav([sil(1), tone(1), sil(1)]));
    assert.equal(await svc().trimFile(f, 'wav', 'both'), true);
    const d = duration(await readFile(f)); assert.ok(d > 1.0 && d < 1.7, String(d));
    assert.deepEqual(await readdir(dir), ['a.wav']);
  }));
  it('UTC-AD-108 trimFile default edges behave as "both"', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); await writeFile(f, buildWav([noise(1), tone(1), noise(1)]));
    assert.equal(await svc().trimFile(f, 'wav'), true);
    const d = duration(await readFile(f)); assert.ok(d > 1.0 && d < 1.7, String(d));
  }));
  it('UTC-AD-109 trimFile "end" keeps the leading part and cuts only the tail', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); await writeFile(f, buildWav([sil(1), tone(1), sil(1)]));
    assert.equal(await svc().trimFile(f, 'wav', 'end'), true);
    const d = duration(await readFile(f)); assert.ok(d > 2.0 && d < 2.5, String(d));
  }));
  it('UTC-AD-110 trimFile "end" returns false when only leading silence exists (tone runs to the end)', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = buildWav([sil(1), tone(1)]); await writeFile(f, original);
    assert.equal(await svc().trimFile(f, 'wav', 'end'), false);
    assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-111 trimFile "both" trims leading silence when tone runs to the end', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); await writeFile(f, buildWav([sil(1), tone(1)]));
    assert.equal(await svc().trimFile(f, 'wav', 'both'), true);
    const d = duration(await readFile(f)); assert.ok(d > 1.0 && d < 1.3, String(d));
  }));
  it('UTC-AD-112 silence-only input is kept unchanged (false)', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = buildWav([sil(2)]); await writeFile(f, original);
    assert.equal(await svc().trimFile(f, 'wav', 'both'), false); assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-113 noise-only input (no pitch) is kept unchanged', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = buildWav([noise(2)]); await writeFile(f, original);
    assert.equal(await svc().trimFile(f, 'wav', 'end'), false); assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-114 tone filling the whole file needs no cut (false)', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = buildWav([tone(2)]); await writeFile(f, original);
    assert.equal(await svc().trimFile(f, 'wav', 'both'), false); assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-115 tone below the -45 dB level threshold is treated as silence', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = buildWav([sil(1), { kind: 'tone', seconds: 1, amplitude: 20 }, sil(1)]); await writeFile(f, original);
    assert.equal(await svc().trimFile(f, 'wav', 'both'), false); assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-116 audio shorter than the minimum number of analysis frames is kept (false)', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = buildWav([{ kind: 'tone', seconds: 0.03 }]); await writeFile(f, original);
    assert.equal(await svc().trimFile(f, 'wav', 'both'), false); assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-117 unsupported extension returns false without invoking ffmpeg', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.flac'); const original = buildWav([sil(1), tone(1), sil(1)]); await writeFile(f, original);
    const log = mock.method(console, 'error', () => undefined);
    assert.equal(await new AudioPitchTrimService('ffmpeg-khong-ton-tai').trimFile(f, 'flac'), false);
    assert.equal(log.mock.calls.length, 0); assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-118 ffmpeg missing: returns false, logs message, keeps original, no temp file left', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = buildWav([sil(1), tone(1)]); await writeFile(f, original);
    const log = mock.method(console, 'error', () => undefined);
    assert.equal(await new AudioPitchTrimService('ffmpeg-khong-ton-tai').trimFile(f, 'wav'), false);
    assert.equal(log.mock.calls[0].arguments[0], 'Không thể cắt audio theo cao độ, giữ nguyên file gốc.');
    assert.deepEqual(await readFile(f), original); assert.deepEqual(await readdir(dir), ['a.wav']);
  }));
  it('UTC-AD-119 undecodable (garbage) content returns false and keeps the file', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.wav'); const original = Buffer.from('this is not audio at all'.repeat(50)); await writeFile(f, original);
    mock.method(console, 'error', () => undefined);
    assert.equal(await svc().trimFile(f, 'wav'), false); assert.deepEqual(await readFile(f), original);
  }));
  it('UTC-AD-120 missing input file returns false and does not throw', () => withDir(async (dir) => {
    mock.method(console, 'error', () => undefined);
    assert.equal(await svc().trimFile(path.join(dir, 'nope.wav'), 'wav'), false);
  }));
  it('UTC-AD-121 mp3 extension is re-encoded and shortened', () => withDir(async (dir) => {
    const f = path.join(dir, 'a.mp3'); const original = buildWav([sil(1), tone(1), sil(1)]); await writeFile(f, original);
    mock.method(console, 'error', () => undefined);
    const ok = await svc().trimFile(f, 'mp3', 'both');
    assert.equal(ok, true);
    const out = await readFile(f); assert.notDeepEqual(out, original); assert.ok(out.length > 1024);
  }));

  it('UTC-AD-122 trimBuffer returns null for silence-only buffer', async () => {
    assert.equal(await svc().trimBuffer(buildWav([sil(2)]), 'wav'), null);
  });
  it('UTC-AD-123 trimBuffer returns a shorter buffer for silence-tone-silence', async () => {
    const out = await svc().trimBuffer(buildWav([sil(1), tone(1), sil(1)]), 'wav');
    assert.ok(out); const d = duration(out); assert.ok(d > 1.0 && d < 1.7, String(d));
  });
  it('UTC-AD-124 trimBuffer "end" keeps the leading silence', async () => {
    const out = await svc().trimBuffer(buildWav([sil(1), tone(1), sil(1)]), 'wav', 'end');
    assert.ok(out); const d = duration(out); assert.ok(d > 2.0 && d < 2.5, String(d));
  });
  it('UTC-AD-125 trimBuffer returns null for unsupported extension and removes its temp directory', async () => {
    const count = async () => (await readdir(os.tmpdir())).filter((n) => n.startsWith('bvc-audio-trim-')).length;
    const before = await count();
    assert.equal(await svc().trimBuffer(buildWav([sil(1), tone(1), sil(1)]), 'flac'), null);
    assert.equal(await count(), before);
  });
  it('UTC-AD-126 trimBuffer returns null when ffmpeg fails', async () => {
    mock.method(console, 'error', () => undefined);
    assert.equal(await new AudioPitchTrimService('ffmpeg-khong-ton-tai').trimBuffer(buildWav([sil(1), tone(1), sil(1)]), 'wav'), null);
  });
  it('UTC-AD-127 trimBuffer with empty buffer returns null without throwing', async () => {
    mock.method(console, 'error', () => undefined);
    assert.equal(await svc().trimBuffer(Buffer.alloc(0), 'wav'), null);
  });
});
