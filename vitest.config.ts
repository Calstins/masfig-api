import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false, // one shared test database
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:54329/masfig_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
      IP_HASH_SALT: 'test-salt-123',
      STORAGE_DRIVER: 'memory',
      CORS_ORIGINS: 'https://masfig.com,http://localhost:3000',
      CF_PAGES_DEPLOY_HOOK_URL: 'https://hook.test.invalid/deploy',
    },
  },
})
