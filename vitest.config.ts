import { defineConfig } from 'vitest/config';

// Integration tests run against a real PostgreSQL database (TEST_DATABASE_URL), reset before the run
const testDatabaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bvc_m02_test';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/support/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-jwt-secret',
      FILE_STORAGE_PROVIDER: 'local',
      FILE_STORAGE_LOCAL_ROOT: './storage-test',
      FILE_STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
      RABBITMQ_URL: ''
    }
  }
});
