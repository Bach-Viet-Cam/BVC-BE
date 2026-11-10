import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AudioSilenceTrimService from './AudioSilenceTrimService.ts';

const sampleRate = 16000;

// Tạo WAV mono 16-bit: [im lặng][tiếng 440 Hz][im lặng] (đơn vị: giây)
function buildWav(leadingSec: number, toneSec: number, trailingSec: number): Buffer {
  const total = Math.round((leadingSec + toneSec + trailingSec) * sampleRate);
  const toneStart = Math.round(leadingSec * sampleRate);
  const toneEnd = toneStart + Math.round(toneSec * sampleRate);
  const pcm = Buffer.alloc(total * 2);
  for (let index = toneStart; index < toneEnd; index += 1) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 16000), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii'); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function readDurationSec(wav: Buffer): number {
  const dataOffset = wav.indexOf('data', 12, 'ascii');
  return wav.readUInt32LE(dataOffset + 4) / (sampleRate * 2);
}

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-trim-test-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('Cắt khoảng lặng đầu và cuối, giữ đệm ngắn quanh tiếng', async () => {
  await withDirectory(async (directory) => {
    const target = path.join(directory, 'recording');
    await writeFile(target, buildWav(1, 1, 1));
    const isTrimmed = await new AudioSilenceTrimService().trimFile(target, 'wav');
    assert.equal(isTrimmed, true);
    const durationSec = readDurationSec(await readFile(target));
    assert.ok(durationSec > 1.0 && durationSec < 1.6, `Thời lượng sau cắt không hợp lệ: ${durationSec}`);
    assert.deepEqual(await readdir(directory), ['recording']);
  });
});

test('Bản thu hoàn toàn im lặng được giữ nguyên', async () => {
  await withDirectory(async (directory) => {
    const target = path.join(directory, 'silent.wav');
    const original = buildWav(2, 0, 0);
    await writeFile(target, original);
    assert.equal(await new AudioSilenceTrimService().trimFile(target, 'wav'), false);
    assert.deepEqual(await readFile(target), original);
  });
});

test('ffmpeg lỗi thì giữ nguyên bản gốc và không ném lỗi', async () => {
  await withDirectory(async (directory) => {
    const target = path.join(directory, 'recording.wav');
    const original = buildWav(1, 1, 1);
    await writeFile(target, original);
    assert.equal(await new AudioSilenceTrimService('ffmpeg-khong-ton-tai').trimFile(target, 'wav'), false);
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual(await readdir(directory), ['recording.wav']);
  });
});

test('trimBuffer trả về null khi không cắt được và buffer mới khi cắt được', async () => {
  const service = new AudioSilenceTrimService();
  assert.equal(await service.trimBuffer(buildWav(2, 0, 0), 'wav'), null);
  const trimmed = await service.trimBuffer(buildWav(1, 1, 1), 'wav');
  assert.ok(trimmed && readDurationSec(trimmed) < 1.6);
});
