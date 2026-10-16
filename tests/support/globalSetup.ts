import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Syncs the schema of the dedicated test database once per run; each test file truncates its tables itself
export default function setupTestDatabase(): void {
  const databaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bvc_m02_test';
  execSync('npx prisma db push', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });
  fs.rmSync('./storage-test', { recursive: true, force: true });
}
