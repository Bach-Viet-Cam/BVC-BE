import { defineConfig } from 'vitest/config';

// Integration tests truncate tables: they always run against TEST_DATABASE_URL, never DATABASE_URL from .env
// (dotenv does not override variables that are already set).
const testDatabaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://bvc:bvc_local@localhost:5433/bvc_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-jwt-secret',
      GOOGLE_CLIENT_ID: 'test-google-client-id'
    },
    coverage: {
      provider: 'v8',
      include: ['src/modules/classes/**/*.ts', 'src/modules/roadmaps/**/*.ts', 'src/utils/DateTimeUtil.ts', 'src/constants/MessageConstant.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 }
    }
  }
});
