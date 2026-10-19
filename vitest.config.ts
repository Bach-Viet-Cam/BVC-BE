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
      PUBLIC_API_URL: 'http://localhost:3000',
      REDIS_URL: '',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_DIR: './storage-test',
      STORAGE_SIGNING_SECRET: 'test-storage-secret',
      AI_SERVICE_URL: '',
      AI_CALLBACK_SECRET: 'test-callback-secret',
      MOCK_AI_SERVICE: 'false'
    }
  }
});
