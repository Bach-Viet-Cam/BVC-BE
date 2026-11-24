import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AppError from '../../../utils/AppError.ts';
import AudioFilePolicyService from './AudioFilePolicyService.ts';

// GBR-10 limits normally come from System Configuration; the unit tests use fixed ones and a fixed duration
const TEST_RULES = { extensions: ['mp3', 'wav', 'm4a'], formatLabel: 'MP3, WAV, M4A', maxMb: 25, maxBytes: 25 * 1024 * 1024 };
const testPolicy = (overrides: ConstructorParameters<typeof AudioFilePolicyService>[0] = {}) => new AudioFilePolicyService({
  getFileRules: async () => TEST_RULES, readDurationSec: async () => 5, assertDuration: async () => undefined, ...overrides
});

const FORMAT_MESSAGE = 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng MP3, WAV, M4A.';
const EMPTY_MESSAGE = 'File phải có dữ liệu và không vượt quá 25 MB.';
const SIZE_MESSAGE = 'File vượt quá dung lượng tối đa 25 MB.';
const MAX = 25 * 1024 * 1024;

describe('AudioFilePolicyService.validate (UTC-AD)', () => {
  let directory: string;
  let source: string;
  const policy = testPolicy();
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
    await assert.rejects(policy.validate(make({ size: 0 })), expectBadRequest(EMPTY_MESSAGE));
  });
  it('UTC-AD-006 rejects size over the configured limit (MSG-14)', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    await assert.rejects(policy.validate(make({ size: MAX + 1 })), expectBadRequest(SIZE_MESSAGE));
  });
  it('UTC-AD-007 accepts size exactly the configured limit', async () => {
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
  it('UTC-AD-054 rejects extension outside the configured formats (.ogg) even with valid WAV content', async () => {
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

describe('AudioFilePolicyService.validate: System Configuration limits (GBR-10)', () => {
  let directory: string;
  let source: string;
  const wav = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({ path: source, originalname: 'ban-thu.wav', mimetype: 'audio/wav', size: 12, ...overrides } as Express.Multer.File);

  before(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-utc-limits-')); source = path.join(directory, 'input'); });
  after(async () => { await rm(directory, { recursive: true, force: true }); });

  it('UTC-AD-070 size limit and messages follow the configured MB value', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    const policy = testPolicy({ getFileRules: async () => ({ ...TEST_RULES, maxMb: 2, maxBytes: 2 * 1024 * 1024 }) });
    await assert.rejects(policy.validate(wav({ size: 2 * 1024 * 1024 + 1 })), (error: unknown) =>
      error instanceof AppError && error.message === 'File vượt quá dung lượng tối đa 2 MB.' && error.code === 'MSG-14');
    await assert.rejects(policy.validate(wav({ size: 0 })), (error: unknown) =>
      error instanceof AppError && error.message === 'File phải có dữ liệu và không vượt quá 2 MB.');
  });
  it('UTC-AD-071 duration outside the configured range is rejected with the range check error', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    const outOfRange = AppError.withMessage(400, 'MSG-15', { min: '0:02', max: '0:08' }, 'file');
    const policy = testPolicy({ readDurationSec: async () => 9, assertDuration: async (seconds) => { if (seconds > 8) throw outOfRange; } });
    await assert.rejects(policy.validate(wav()), (error: unknown) => error === outOfRange);
  });
  it('UTC-AD-072 a duration that cannot be read gives MSG-13', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    const policy = testPolicy({ readDurationSec: async () => { throw new Error('bad header'); } });
    await assert.rejects(policy.validate(wav()), (error: unknown) => error instanceof AppError && error.code === 'MSG-13');
  });
  it('UTC-AD-073 accepts M4A content (ftyp box) with .m4a and audio/mp4', async () => {
    await writeFile(source, Buffer.from('\0\0\0\x20ftypM4A \0\0\0\0', 'latin1'));
    assert.equal(await testPolicy().validate(wav({ originalname: 'thu.m4a', mimetype: 'audio/x-m4a', size: 16 })), 'audio/mp4');
  });
  it('UTC-AD-074 a format removed from the configured list is rejected', async () => {
    await writeFile(source, 'RIFF0000WAVE');
    const policy = testPolicy({ getFileRules: async () => ({ ...TEST_RULES, extensions: ['mp3'], formatLabel: 'MP3' }) });
    await assert.rejects(policy.validate(wav()), (error: unknown) =>
      error instanceof AppError && error.message === 'Định dạng file không được hỗ trợ. Vui lòng chọn file có định dạng MP3.');
  });
});
