import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AudioFilePolicyService from './AudioFilePolicyService.ts';

test('Kiểm tra nội dung file thay vì tin extension và MIME', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-policy-test-'));
  try {
    const source = path.join(directory, 'input');
    await writeFile(source, 'RIFF0000WAVE');
    const file = { path: source, originalname: 'teacher.wav', mimetype: 'audio/wav', size: 12 } as Express.Multer.File;
    const policy = new AudioFilePolicyService();
    assert.equal(await policy.validate(file), 'audio/wav');
    await assert.rejects(policy.validate({ ...file, originalname: 'teacher.mp3', mimetype: 'audio/mpeg' }));
    await writeFile(source, 'not an audio');
    await assert.rejects(policy.validate(file));
    await assert.rejects(policy.validate({ ...file, size: 0 }));
    await assert.rejects(policy.validate({ ...file, size: 25 * 1024 * 1024 + 1 }));
    await assert.rejects(policy.validate(undefined));
    await writeFile(source, Buffer.from([0xff, 0xfb, 0x90, 0x64]));
    assert.equal(await policy.validate({ ...file, size: 4, originalname: 'student.mp3', mimetype: 'audio/mpeg' }), 'audio/mpeg');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
