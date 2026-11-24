import { defineConfig } from 'vitest/config';

// Runs only tests/unit and needs no database: the integration global setup (prisma db push) is not loaded.
// Usage: npx vitest run --config tests/unit/vitest.unit.config.ts
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: '',
      JWT_SECRET: 'unit-test-secret',
      FILE_STORAGE_PROVIDER: 'local',
      FILE_STORAGE_LOCAL_ROOT: './storage-test',
      FILE_STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
      RABBITMQ_URL: ''
    }
  }
});
