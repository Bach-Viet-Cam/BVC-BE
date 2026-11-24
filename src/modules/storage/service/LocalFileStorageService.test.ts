import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import LocalFileStorageService from './LocalFileStorageService.ts';

const BASE_URL = 'http://localhost:3000';
const VALID_KEY = 'audio/11111111-1111-4111-8111-111111111111.wav';

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bvc-ut-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('UTC-LFS-001 - download URL uses public base and mount path', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    assert.equal(await storage.getDownloadUrl(VALID_KEY), 'http://localhost:3000/uploads/audio/11111111-1111-4111-8111-111111111111.wav');
  });
});

test('UTC-LFS-002 - provider is local', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, 'https://storage.example.com/');
    assert.equal(storage.provider, 'local');
  });
});

test('UTC-LFS-003 - reject ftp public URL', async () => {
  await withTempDir(async (dir) => {
    // R1: tưởng ftp cũng nhận
    assert.throws(() => new LocalFileStorageService(dir, 'ftp://files.example.com/'), {
      message: 'URL công khai của storage không hợp lệ.'
    });
  });
});

test('UTC-LFS-004 - reject public URL with sub path', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => new LocalFileStorageService(dir, 'http://localhost:3000/files'), {
      message: 'URL công khai của storage không hợp lệ.'
    });
  });
});

test('UTC-LFS-005 - reject public URL with credentials', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => new LocalFileStorageService(dir, 'http://user:pass@localhost:3000/'), {
      message: 'URL công khai của storage không hợp lệ.'
    });
  });
});

test('UTC-LFS-006 - reject public URL with query string', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => new LocalFileStorageService(dir, 'http://localhost:3000/?x=1'), {
      message: 'URL công khai của storage không hợp lệ.'
    });
  });
});

test('UTC-LFS-007 - reject unsupported namespace', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.rejects(
      storage.save({ sourcePath: path.join(dir, 'a.wav'), originalName: 'a.wav', contentType: 'audio/wav', namespace: 'images' }),
      { message: 'Thư mục lưu file không được hỗ trợ.' }
    );
  });
});

test('UTC-LFS-008 - reject unsupported file extension', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.rejects(
      storage.save({ sourcePath: path.join(dir, 'doc.txt'), originalName: 'doc.txt', contentType: 'text/plain', namespace: 'audio' }),
      { message: 'Định dạng file không được hỗ trợ.' }
    );
  });
});

test('UTC-LFS-009 - save lowercases WAV extension', async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, 'source.wav');
    await writeFile(source, 'RIFF0000WAVE');
    const storage = new LocalFileStorageService(dir, BASE_URL);
    const saved = await storage.save({ sourcePath: source, originalName: 'BAI.WAV', contentType: 'audio/wav', namespace: 'audio' });
    // R1: tưởng giữ .WAV
    assert.match(saved.key, /^audio\/[0-9a-f-]{36}\.wav$/);
    assert.equal(saved.sizeBytes, 12);
    assert.equal(saved.contentType, 'audio/wav');
  });
});

test('UTC-LFS-010 - save mp3 with metadata', async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, 'source.mp3');
    await writeFile(source, 'MP3DATA!');
    const storage = new LocalFileStorageService(dir, BASE_URL);
    const saved = await storage.save({ sourcePath: source, originalName: 'song.mp3', contentType: 'audio/mpeg', namespace: 'audio' });
    assert.match(saved.key, /^audio\/[0-9a-f-]{36}\.mp3$/);
    assert.equal(saved.sizeBytes, 8);
    assert.equal(saved.contentType, 'audio/mpeg');
  });
});

test('UTC-LFS-011 - missing source file raises ENOENT', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.rejects(
      storage.save({ sourcePath: path.join(dir, 'missing.wav'), originalName: 'a.wav', contentType: 'audio/wav', namespace: 'audio' }),
      { message: /ENOENT: no such file or directory/ }
    );
  });
});

test('UTC-LFS-012 - reject uppercase extension key', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.rejects(
      storage.getDownloadUrl('audio/11111111-1111-4111-8111-111111111111.WAV'),
      { message: 'Đường dẫn file không hợp lệ.' }
    );
  });
});

test('UTC-LFS-013 - reject unsupported extension key', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.rejects(
      storage.getDownloadUrl('audio/11111111-1111-4111-8111-111111111111.ogg'),
      { message: 'Đường dẫn file không hợp lệ.' }
    );
  });
});

test('UTC-LFS-014 - reject traversal key on download URL', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.rejects(storage.getDownloadUrl('../secret.env'), { message: 'Đường dẫn file không hợp lệ.' });
  });
});

test('UTC-LFS-015 - reject traversal key on delete', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.rejects(storage.delete('../secret.env'), { message: 'Đường dẫn file không hợp lệ.' });
  });
});

test('UTC-LFS-016 - delete of missing valid key is safe', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.doesNotReject(storage.delete(VALID_KEY));
  });
});

test('UTC-LFS-017 - delete same valid key twice is safe', async () => {
  await withTempDir(async (dir) => {
    const storage = new LocalFileStorageService(dir, BASE_URL);
    await assert.doesNotReject(async () => {
      await storage.delete(VALID_KEY);
      await storage.delete(VALID_KEY);
    });
  });
});

test('UTC-LFS-018 - reject symlink audio directory', async () => {
  await withTempDir(async (dir) => {
    const root = path.join(dir, 'root');
    const elsewhere = path.join(dir, 'elsewhere');
    await mkdir(root);
    await mkdir(elsewhere);
    // Windows chặn symlink thường (EPERM); junction tạo cùng điều kiện isSymbolicLink() mà không cần quyền admin.
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await symlink(elsewhere, path.join(root, 'audio'), linkType);
    const storage = new LocalFileStorageService(root, BASE_URL);
    // R1: quên tạo symlink ở lần 1; pass ở vòng 3
    await assert.rejects(
      storage.save({ sourcePath: path.join(dir, 'a.wav'), originalName: 'a.wav', contentType: 'audio/wav', namespace: 'audio' }),
      { message: 'Thư mục audio không được là liên kết tượng trưng.' }
    );
  });
});
