import { defineConfig } from 'vitest/config';

const testDatabaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bvc_music_it_test';
process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    include: [
      'tests/integration/music-library/**/*.test.ts',
      'tests/{lecturerPieces,sheetMusic,uploads,library,savedItems,analysis}.test.ts'
    ],
    globalSetup: ['tests/support/migratedDatabaseSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-jwt-secret',
      FILE_STORAGE_PROVIDER: 'local',
      FILE_STORAGE_LOCAL_ROOT: './storage-test',
      FILE_STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
      RABBITMQ_URL: ''
    }
  }
});
