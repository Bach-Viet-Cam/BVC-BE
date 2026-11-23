import fs from 'node:fs';

// Uses a test database already migrated with `prisma migrate deploy`; never runs `prisma db push`
export default function setupMigratedTestDatabase(): void {
  const databaseUrl = process.env.TEST_DATABASE_URL || '';
  const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : '';
  if (!databaseName.includes('test')) {
    throw new Error('TEST_DATABASE_URL phải trỏ tới database test (tên có chữ "test").');
  }
  fs.rmSync('./storage-test', { recursive: true, force: true });
}
