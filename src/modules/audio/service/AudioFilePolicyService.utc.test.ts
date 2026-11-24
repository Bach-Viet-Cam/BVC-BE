import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AppError from '../../../utils/AppError.ts';
import AudioFilePolicyService from './AudioFilePolicyService.ts';

const FORMAT_MESSAGE = 'File phải là WAV hoặc MP3 với nội dung và định dạng audio phù hợp.';
const SIZE_MESSAGE = 'File phải có dữ liệu và không vượt quá 25 MiB.';
const MAX = 25 * 1024 * 1024;

describe('AudioFilePolicyService.validate (UTC-AD)', () => {
  let directory: string;
  let source: string;
  const policy = new AudioFilePolicyService();
  const make = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({ path: source, originalname: 'teacher.wav', mimetype: 'audio/wav', size: 12, ...overrides } as Express.Multer.File);
  const expectBadRequest = (message: string) => (error: unknown) =>
    error instanceof AppError && error.statusCode === 400 && error.message === message;

  before(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-utc-policy-')); source = path.join(directory, 'input'); });
  after(async () => { await rm(directory, { recursive: true, force: true }); });

  it('UTC-AD-001 accepts WAV content with .wav and audio/wav', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    assert.equal(await policy.validate(make()), 'audio/wav');
  });
  it('UTC-AD-002 accepts MPEG frame header with .mp3 and audio/mpeg', async () => {
    await writeFile(source, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
    assert.equal(await policy.validate(make({ originalname: 'student.mp3', mimetype: 'audio/mpeg', size: 4 })), 'audio/mpeg');
  });
  it('UTC-AD-003 accepts ID3 header with upper-case extension and alias MIME', async () => {
    await writeFile(source, Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'latin1'));
    assert.equal(await policy.validate(make({ originalname: 'Bai1.MP3', mimetype: 'audio/mp3', size: 10 })), 'audio/mpeg');
  });
  it('UTC-AD-004 rejects missing file', async () => {
    await assert.rejects(policy.validate(undefined), expectBadRequest('Vui lòng chọn một file audio.'));
  });
  it('UTC-AD-005 rejects size 0', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    await assert.rejects(policy.validate(make({ size: 0 })), expectBadRequest(SIZE_MESSAGE));
  });
  it('UTC-AD-006 rejects size 25 MiB + 1', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    await assert.rejects(policy.validate(make({ size: MAX + 1 })), expectBadRequest(SIZE_MESSAGE));
  });
  it('UTC-AD-007 accepts size exactly 25 MiB', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    assert.equal(await policy.validate(make({ size: MAX })), 'audio/wav');
  });
  it('UTC-AD-008 rejects text content renamed .wav', async () => {
    await writeFile(source, 'not an audio');
    await assert.rejects(policy.validate(make()), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-009 rejects WAV content named .mp3 with audio/mpeg', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    await assert.rejects(policy.validate(make({ originalname: 'teacher.mp3', mimetype: 'audio/mpeg' })), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-010 rejects video/mp4 mimetype', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    await assert.rejects(policy.validate(make({ mimetype: 'video/mp4' })), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-011 rejects a 3-byte truncated RIFF header', async () => {
    await writeFile(source, 'RIF');
    await assert.rejects(policy.validate(make({ originalname: 'a.wav', size: 3 })), expectBadRequest(FORMAT_MESSAGE));
  });

  // New cases
  it('UTC-AD-052 accepts WAV alias MIME audio/x-wav', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    assert.equal(await policy.validate(make({ mimetype: 'audio/x-wav' })), 'audio/wav');
  });
  it('UTC-AD-053 accepts MP3 alias MIME audio/x-mp3', async () => {
    await writeFile(source, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
    assert.equal(await policy.validate(make({ originalname: 'a.mp3', mimetype: 'audio/x-mp3', size: 4 })), 'audio/mpeg');
  });
  it('UTC-AD-054 rejects extension outside wav/mp3 (.ogg) even with valid WAV content', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    await assert.rejects(policy.validate(make({ originalname: 'a.ogg' })), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-055 rejects file name without extension', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    await assert.rejects(policy.validate(make({ originalname: 'teacher' })), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-056 rejects RIFF container that is not WAVE (AVI)', async () => {
    await writeFile(source, 'RIFF0000AVI ');
    await assert.rejects(policy.validate(make()), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-057 rejects MPEG header with invalid bitrate index 0', async () => {
    await writeFile(source, Buffer.from([0xff, 0xfb, 0x00, 0x64]));
    await assert.rejects(policy.validate(make({ originalname: 'a.mp3', mimetype: 'audio/mpeg', size: 4 })), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-058 rejects MPEG header with invalid bitrate index 15', async () => {
    await writeFile(source, Buffer.from([0xff, 0xfb, 0xf0, 0x64]));
    await assert.rejects(policy.validate(make({ originalname: 'a.mp3', mimetype: 'audio/mpeg', size: 4 })), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-059 rejects 11-byte WAV header (one byte short of 12)', async () => {
    await writeFile(source, 'RIFF0000WAV');
    await assert.rejects(policy.validate(make({ size: 11 })), expectBadRequest(FORMAT_MESSAGE));
  });
  it('UTC-AD-060 rejects when the temp file does not exist (ENOENT)', async () => {
    await assert.rejects(policy.validate(make({ path: path.join(directory, 'missing-file') })), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
  });
});
