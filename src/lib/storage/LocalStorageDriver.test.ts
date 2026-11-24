import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { mkdtemp, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import EnvConfig from '../../config/EnvConfig.ts';
import LocalStorageDriver from './LocalStorageDriver.ts';

async function withDriver(run: (driver: LocalStorageDriver, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bvc-ut-'));
  const driver = new LocalStorageDriver(root);
  try {
    await run(driver, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function stubBaseUrl(url: string): () => void {
  const original = EnvConfig.fileStoragePublicBaseUrl;
  Object.defineProperty(EnvConfig, 'fileStoragePublicBaseUrl', { value: url, configurable: true, writable: true });
  return () => Object.defineProperty(EnvConfig, 'fileStoragePublicBaseUrl', { value: original, configurable: true, writable: true });
}

test('UTC-LSD-001 - reject traversal key on resolvePath', async () => {
  await withDriver(async (driver) => {
    assert.throws(() => driver.resolvePath('../../.env'), { message: 'Invalid storage key.' });
  });
});

test('UTC-LSD-002 - constructor resolves root to absolute path', () => {
  const driver = new LocalStorageDriver('uploads');
  assert.equal(driver.rootDir, path.resolve('uploads'));
  assert.ok(path.isAbsolute(driver.rootDir));
});

test('UTC-LSD-003 - resolvePath builds path under root', async () => {
  await withDriver(async (driver, root) => {
    assert.equal(driver.resolvePath('sheet/2026-11/a.pdf'), path.join(root, 'sheet/2026-11/a.pdf'));
  });
});

test('UTC-LSD-004 - reject empty storage key', async () => {
  await withDriver(async (driver) => {
    assert.throws(() => driver.resolvePath(''), { message: 'Invalid storage key.' });
  });
});

test('UTC-LSD-005 - createReadUrl encodes space in key', async () => {
  await withDriver(async (driver) => {
    const restore = stubBaseUrl('http://localhost:3000');
    try {
      assert.equal(
        driver.createReadUrl('sheet/2026-11/my file.pdf'),
        'http://localhost:3000/uploads/sheet/2026-11/my%20file.pdf'
      );
    } finally {
      restore();
    }
  });
});

test('UTC-LSD-006 - createReadUrl encodes Vietnamese characters', async () => {
  await withDriver(async (driver) => {
    const restore = stubBaseUrl('http://localhost:3000');
    try {
      // R1: encode thiếu dấu tiếng Việt
      assert.equal(
        driver.createReadUrl('sheet/bản nhạc.pdf'),
        'http://localhost:3000/uploads/sheet/b%E1%BA%A3n%20nh%E1%BA%A1c.pdf'
      );
    } finally {
      restore();
    }
  });
});

test('UTC-LSD-007 - statObject returns byte size', async () => {
  await withDriver(async (driver, root) => {
    await writeFile(path.join(root, 'a.bin'), 'RIFF0000WAVE');
    assert.deepEqual(await driver.statObject('a.bin'), { sizeBytes: 12 });
  });
});

test('UTC-LSD-008 - statObject returns null for missing object', async () => {
  await withDriver(async (driver) => {
    assert.equal(await driver.statObject('missing.bin'), null);
  });
});

test('UTC-LSD-009 - statObject returns null for invalid key', async () => {
  await withDriver(async (driver) => {
    assert.equal(await driver.statObject('../secret.env'), null);
  });
});

test('UTC-LSD-010 - readRange returns first bytes', async () => {
  await withDriver(async (driver, root) => {
    await writeFile(path.join(root, 'a.bin'), 'RIFF0000');
    assert.equal((await driver.readRange('a.bin', 4)).toString(), 'RIFF');
  });
});

test('UTC-LSD-011 - readRange with large count returns full object', async () => {
  await withDriver(async (driver, root) => {
    await writeFile(path.join(root, 'a.bin'), 'RIFF0000');
    const buffer = await driver.readRange('a.bin', 100);
    assert.equal(buffer.length, 8);
    assert.equal(buffer.toString(), 'RIFF0000');
  });
});

test('UTC-LSD-012 - readRange on missing object rejects ENOENT', async () => {
  await withDriver(async (driver) => {
    // R1: tưởng trả Buffer rỗng
    await assert.rejects(driver.readRange('missing.bin', 4), {
      message: /ENOENT: no such file or directory/
    });
  });
});

test('UTC-LSD-013 - readObject returns whole buffer', async () => {
  await withDriver(async (driver, root) => {
    await writeFile(path.join(root, 'a.bin'), 'RIFF0000');
    assert.equal((await driver.readObject('a.bin')).toString(), 'RIFF0000');
  });
});

test('UTC-LSD-014 - openReadStream returns a ReadStream', async () => {
  await withDriver(async (driver, root) => {
    await writeFile(path.join(root, 'a.bin'), 'RIFF0000');
    const stream = await driver.openReadStream('a.bin');
    try {
      assert.ok(stream instanceof fs.ReadStream);
    } finally {
      (stream as fs.ReadStream).destroy();
    }
  });
});

test('UTC-LSD-015 - putObject creates nested file', async () => {
  await withDriver(async (driver, root) => {
    await driver.putObject('sheet/2026-11/a.pdf', Buffer.from('pdf-content'));
    const stored = await readFile(path.join(root, 'sheet/2026-11/a.pdf'), 'utf8');
    assert.equal(stored, 'pdf-content');
  });
});

test('UTC-LSD-016 - putObject overwrites existing object', async () => {
  await withDriver(async (driver, root) => {
    await driver.putObject('a.bin', Buffer.from('old'));
    await driver.putObject('a.bin', Buffer.from('new'));
    assert.equal(await readFile(path.join(root, 'a.bin'), 'utf8'), 'new');
  });
});

test('UTC-LSD-017 - putObject rejects invalid key', async () => {
  await withDriver(async (driver) => {
    await assert.rejects(driver.putObject('../secret.env', Buffer.from('x')), {
      message: 'Invalid storage key.'
    });
  });
});

test('UTC-LSD-018 - writeStream returns number of bytes written', async () => {
  await withDriver(async (driver) => {
    const written = await driver.writeStream('a.bin', Readable.from([Buffer.alloc(10, 1)]), 20);
    assert.equal(written, 10);
  });
});

test('UTC-LSD-019 - writeStream rejects upload over limit', async () => {
  await withDriver(async (driver) => {
    // R1: quên kiểm tra file bị xóa
    await assert.rejects(driver.writeStream('a.bin', Readable.from([Buffer.alloc(30, 1)]), 20), {
      message: 'Upload too large.'
    });
  });
});

test('UTC-LSD-020 - writeStream accepts exactly max bytes', async () => {
  await withDriver(async (driver) => {
    const written = await driver.writeStream('a.bin', Readable.from([Buffer.alloc(20, 1)]), 20);
    assert.equal(written, 20);
  });
});

test('UTC-LSD-021 - writeStream propagates source error', async () => {
  await withDriver(async (driver) => {
    const source = new Readable({
      read() {
        this.destroy(new Error('source failed'));
      }
    });
    await assert.rejects(driver.writeStream('a.bin', source, 20), { message: 'source failed' });
  });
});

test('UTC-LSD-022 - deleteObject removes existing object', async () => {
  await withDriver(async (driver, root) => {
    await writeFile(path.join(root, 'a.bin'), 'RIFF0000');
    await driver.deleteObject('a.bin');
    await assert.rejects(stat(path.join(root, 'a.bin')));
  });
});

test('UTC-LSD-023 - deleteObject on missing object is safe', async () => {
  await withDriver(async (driver) => {
    await assert.doesNotReject(driver.deleteObject('missing.bin'));
  });
});

test('UTC-LSD-024 - deleteObject rejects invalid key', async () => {
  await withDriver(async (driver) => {
    // R1: tưởng force:true nên không lỗi; pass ở vòng 3
    await assert.rejects(driver.deleteObject('../secret.env'), { message: 'Invalid storage key.' });
  });
});
