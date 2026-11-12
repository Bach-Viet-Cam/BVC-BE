import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AudioPitchTrimService from './AudioPitchTrimService.ts';

const sampleRate = 16000;

interface WavPart { kind: 'silence' | 'noise' | 'tone'; seconds: number; }

// Tạo WAV mono 16-bit từ các đoạn: im lặng, tiếng ồn trắng (to nhưng không có cao độ) hoặc tiếng 440 Hz
function buildWav(parts: WavPart[]): Buffer {
  const total = parts.reduce((sum, part) => sum + Math.round(part.seconds * sampleRate), 0);
  const pcm = Buffer.alloc(total * 2);
  let seed = 12345;
  let position = 0;
  for (const part of parts) {
    const length = Math.round(part.seconds * sampleRate);
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const amplitude = part.kind === 'tone' ? Math.sin((2 * Math.PI * 440 * (position + index)) / sampleRate) * 16000
        : part.kind === 'noise' ? (seed / 2147483648 - 0.5) * 16000 : 0;
      pcm.writeInt16LE(Math.round(amplitude), (position + index) * 2);
    }
    position += length;
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

test('Cắt cả hai đầu theo cao độ: bỏ được cả tiếng ồn to nhưng không có cao độ', async () => {
  await withDirectory(async (directory) => {
    const target = path.join(directory, 'recording');
    await writeFile(target, buildWav([{ kind: 'noise', seconds: 1 }, { kind: 'tone', seconds: 1 }, { kind: 'noise', seconds: 1 }]));
    assert.equal(await new AudioPitchTrimService().trimFile(target, 'wav'), true);
    const durationSec = readDurationSec(await readFile(target));
    assert.ok(durationSec > 1.0 && durationSec < 1.6, `Thời lượng sau cắt không hợp lệ: ${durationSec}`);
    assert.deepEqual(await readdir(directory), ['recording']);
  });
});

test('Chế độ chỉ cắt cuối giữ nguyên phần đầu', async () => {
  await withDirectory(async (directory) => {
    const target = path.join(directory, 'live.wav');
    await writeFile(target, buildWav([{ kind: 'noise', seconds: 1 }, { kind: 'tone', seconds: 1 }, { kind: 'silence', seconds: 1 }]));
    assert.equal(await new AudioPitchTrimService().trimFile(target, 'wav', 'end'), true);
    const durationSec = readDurationSec(await readFile(target));
    assert.ok(durationSec > 2.0 && durationSec < 2.5, `Thời lượng sau cắt không hợp lệ: ${durationSec}`);
  });
});

test('Không có cao độ (im lặng hoặc chỉ có tiếng ồn) thì giữ nguyên bản gốc', async () => {
  await withDirectory(async (directory) => {
    for (const kind of ['silence', 'noise'] as const) {
      const target = path.join(directory, `${kind}.wav`);
      const original = buildWav([{ kind, seconds: 2 }]);
      await writeFile(target, original);
      assert.equal(await new AudioPitchTrimService().trimFile(target, 'wav'), false);
      assert.deepEqual(await readFile(target), original);
    }
  });
});

test('ffmpeg lỗi thì giữ nguyên bản gốc và không ném lỗi', async () => {
  await withDirectory(async (directory) => {
    const target = path.join(directory, 'recording.wav');
    const original = buildWav([{ kind: 'silence', seconds: 1 }, { kind: 'tone', seconds: 1 }]);
    await writeFile(target, original);
    assert.equal(await new AudioPitchTrimService('ffmpeg-khong-ton-tai').trimFile(target, 'wav'), false);
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual(await readdir(directory), ['recording.wav']);
  });
});

test('trimBuffer trả về null khi không cắt được và buffer mới khi cắt được', async () => {
  const service = new AudioPitchTrimService();
  assert.equal(await service.trimBuffer(buildWav([{ kind: 'silence', seconds: 2 }]), 'wav'), null);
  const trimmed = await service.trimBuffer(buildWav([{ kind: 'silence', seconds: 1 }, { kind: 'tone', seconds: 1 }, { kind: 'silence', seconds: 1 }]), 'wav');
  assert.ok(trimmed && readDurationSec(trimmed) < 1.6);
});
