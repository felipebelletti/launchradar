import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [resolve(__dirname, 'helpers/setup.ts')],
    teardownTimeout: 15000,
    testTimeout: 30000,
    pool: 'forks',
    isolate: true,
    fileParallelism: false,
    sequence: { concurrent: false },
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? 'postgresql://felipe@localhost/launchradar_test',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379/1',
      TWITTERAPI_KEY: 'test_twitterapi_key',
      ANTHROPIC_API_KEY: 'test_anthropic_key',
      PORT: '0',
      WEBHOOK_POLL_INTERVAL_SECONDS: '60',
      DAILY_CREDIT_BUDGET: '100000',
      ACCOUNT_MONITOR_TTL_DAYS: '15',
      ACCOUNT_POLL_INTERVAL_MS: '300000',
    },
  },
});
